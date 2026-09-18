export const runtime = "edge";

// This route expects the backend to speak the OpenAI-compatible
// /chat/completions API (the common interface for vLLM, OpenRouter,
// Together, Fireworks, text-generation-webui, and most Qwen hosting
// options). Swapping providers later should only mean changing the
// three env vars below.
export async function POST(req) {
  const baseUrl = process.env.QWEN_API_BASE_URL;
  const apiKey = process.env.QWEN_API_KEY;
  const model = process.env.QWEN_MODEL_NAME;

  if (!baseUrl || !model) {
    return jsonError(
      500,
      "QwenLab's backend isn't configured yet. Set QWEN_API_BASE_URL and QWEN_MODEL_NAME " +
        "(and QWEN_API_KEY if your provider needs one) in the Vercel project's Environment Variables, " +
        "then redeploy."
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Malformed request body.");
  }

  const { messages, system } = body || {};
  if (!Array.isArray(messages)) {
    return jsonError(400, "Request must include a `messages` array.");
  }

  const payloadMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  let upstream;
  try {
    upstream = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: payloadMessages,
        stream: true,
      }),
    });
  } catch (err) {
    return jsonError(502, `Could not reach the Qwen backend at QWEN_API_BASE_URL: ${err.message}`);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await safeText(upstream);
    return jsonError(
      502,
      `The Qwen backend returned an error (HTTP ${upstream.status}). ${text ? `Details: ${text.slice(0, 500)}` : ""}`
    );
  }

  // Re-stream the upstream SSE response as plain text deltas, which is
  // all the client needs to append to the message it's rendering.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const json = JSON.parse(data);
              const delta =
                json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.text ?? "";
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // Skip lines that aren't valid JSON deltas.
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
