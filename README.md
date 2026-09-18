# QwenLab

A standalone, ChatGPT-style web UI for talking to a Qwen model (or any
OpenAI-compatible chat backend). Separate from BetLab \u2014 own repo, own
Vercel project, no shared code.

Phase 1 only: chat + role-play, nothing else. No file access, no Python
execution, no agent tools, no BetLab integration. Those are future phases.

## Configure the backend

In the Vercel project's **Settings \u2192 Environment Variables**, set:

- `QWEN_API_BASE_URL` \u2014 base URL of an OpenAI-compatible `/chat/completions`
  API (e.g. an OpenRouter, vLLM, or other hosted endpoint), no trailing slash.
- `QWEN_API_KEY` \u2014 bearer token for that API, if it needs one.
- `QWEN_MODEL_NAME` \u2014 the exact model string your provider expects.

Redeploy after changing env vars (Vercel does this automatically on save
for most setups, or trigger a redeploy manually).

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the three values
npm run dev
```

## Testing your first conversation

1. Open the deployed URL (or http://localhost:3000 locally).
2. Type a normal message and press Enter \u2014 you should see a streaming
   reply. If you instead see a red error banner, it will tell you whether
   the env vars are missing or the upstream Qwen backend rejected the
   request.
3. Try `Role-play as a sarcastic coding partner` to check persona-switching,
   then `let's go back to normal conversation` to switch back.
4. Use **+ New chat** to start a fresh thread, and the sidebar to switch
   between saved conversations (stored in your browser's local storage,
   not on a server).
