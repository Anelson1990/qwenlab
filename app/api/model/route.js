export const runtime = "edge";

// Lets the client honestly display which backend model is wired up,
// without duplicating the value into a separate NEXT_PUBLIC_ var that
// could drift out of sync with QWEN_MODEL_NAME.
export async function GET() {
  const model = process.env.QWEN_MODEL_NAME || null;
  return new Response(JSON.stringify({ model }), {
    headers: { "Content-Type": "application/json" },
  });
}
