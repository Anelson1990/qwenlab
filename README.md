# QwenLab

A standalone, ChatGPT-style web UI for talking to a Qwen model (or any
OpenAI-compatible chat backend). Separate from BetLab - own repo, own
Vercel project, no shared code.

Phase 1 only: chat + role-play, nothing else. No file access, no Python
execution, no agent tools, no BetLab integration. Those are future phases.

The header shows the actual model name it's talking to (fetched live from
`/api/model`, which just echoes `QWEN_MODEL_NAME`), so the UI never claims
to be connected to something it isn't.

## Option A - free proof-of-concept via Vercel AI Gateway

No credit card, no separate provider account. Uses your existing Vercel
account, whose AI Gateway gives every team $5 of free credits per month
(no card required) against a subset of models - which currently includes
a real Qwen release, `alibaba/qwen3.8-flash-next`. This is **not** the
`orcarouter/Qwen3.8-27B-Uncensored` model - it's a different, standard
Qwen model, used here only to prove out the chat UI (streaming, context,
role-play, coding discussion) for free before paying for anything.

1. Vercel dashboard -> **AI Gateway** tab -> **API Keys** -> create one.
2. In the QwenLab project's **Settings -> Environment Variables**, set:
   - `QWEN_API_BASE_URL` = `https://ai-gateway.vercel.sh/v1`
   - `QWEN_API_KEY` = the AI Gateway key from step 1
   - `QWEN_MODEL_NAME` = `alibaba/qwen3.8-flash-next`
3. Redeploy.

**Important:** the $5/month free allowance ends permanently the moment you
add a payment method or buy AI Gateway credits on that team - it's a
one-way door. Don't add a card here if you want to keep this free path
available. Free tier requests are also rate-limited (you'll see occasional
429s under bursty use) - expected for a proof of concept, not a bug.

## Option B - the real target model (paid, later)

Once the UI is proven out, switching to `orcarouter/Qwen3.8-27B-Uncensored`
means changing only the same three env vars - no frontend changes:

- `QWEN_API_BASE_URL` = `https://api.orcarouter.ai/v1`
- `QWEN_API_KEY` = an OrcaRouter API key
- `QWEN_MODEL_NAME` = the exact model id OrcaRouter's dashboard shows for it

Note: hosted access to that specific model is gated by OrcaRouter to
declared security/AI-safety research use. Self-hosting the openly
published weights on rented GPU compute is the alternative if that gate
doesn't fit.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the three values
npm run dev
```

## Testing your first conversation

1. Open the deployed URL (or http://localhost:3000 locally).
2. Check the small text under "QwenLab" in the header - it names the
   actual model you're talking to.
3. Type a normal message and press Enter - you should see a streaming
   reply. A red error banner will tell you whether env vars are missing
   or the upstream backend rejected the request.
4. Try `Role-play as a sarcastic coding partner` to check persona-switching,
   then `let's go back to normal conversation` to switch back.
5. Use **+ New chat** to start a fresh thread, and the sidebar to switch
   between saved conversations (stored in your browser's local storage,
   not on a server).

<!-- redeploy trigger 2026-09-18T03:20:17Z -->
