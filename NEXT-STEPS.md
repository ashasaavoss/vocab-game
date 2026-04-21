# Next Steps

Goal: share the Vocabulary Sampler with a small group of friends via an unlisted web link, without losing the answer history already collected locally.

## Where we are (2026-04-20)

Session export/import is done; the app is now **ready to deploy to Render**. See `DEPLOY.md` for the step-by-step.

**Deployment wiring added:**
- `server/src/rateLimit.ts` — global 500/day cap on `/api/grade` (env `GLOBAL_DAILY_LIMIT`), on top of the existing per-session token bucket.
- `server/src/index.ts` — when `NODE_ENV=production`, Express serves `client/dist` as static files with an SPA fallback. CORS reads from `ALLOWED_ORIGIN` (defaults to `http://localhost:5173` for dev).
- `package.json` (root) — new `start` script runs the server in production mode via `cross-env`.
- `server/package.json` — `tsx` promoted to a runtime dependency so it's available on Render after install.
- `render.yaml` — blueprint for one-click Render setup.

**Decisions taken:**
- Host: **Render** (free tier, Node web service serving both client and API).
- Access: **unlisted URL only** (no password gate).
- Rate limit: **500 requests / rolling 24h, globally** (per-session token bucket stays on top).

**Verified:**
- `npm run typecheck` passes.
- `npm run build` produces `client/dist/` with `index.html`, `assets/`, and `corpus.json`.
- Session export was downloaded locally.

## Next

1. **Round-trip test the import locally** (optional but recommended before deploy). Open a private window at http://localhost:5173, click "Import session from file" in the user picker, load the exported JSON, confirm history and estimates populate.
2. **Deploy.** Follow `DEPLOY.md`. Short version: push to GitHub → Render → New Blueprint → set `GEMINI_API_KEY` and `ALLOWED_ORIGIN` → redeploy.
3. **Post-deploy:** visit the URL, import the exported JSON to restore data, share the URL.

## Known tradeoff

The leaderboard and grading logs are file-backed, so **they reset on every Render redeploy / free-tier sleep**. Per-user session data is in `localStorage` client-side and is unaffected. If the leaderboard reset becomes annoying, upgrade to a Render disk or swap the store for a free hosted KV (Upstash Redis).
