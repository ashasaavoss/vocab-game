# Deploy to Render

The app is a single Node web service: Express serves `/api/*` and, in production, serves the built React client from `client/dist` on the same origin.

## One-time setup

1. Push this repo to GitHub (public or private — Render supports both).
2. Sign in to [render.com](https://render.com) and click **New → Blueprint**.
3. Point it at the repo. Render will detect `render.yaml` and create the `vocabulary-sampler` web service.
4. On the service's **Environment** tab, fill in the secrets Render left blank:
   - `GEMINI_API_KEY` — your Gemini API key.
   - `ALLOWED_ORIGIN` — the public URL Render assigns (e.g. `https://vocabulary-sampler.onrender.com`). You won't know this until after the first deploy; set a placeholder, deploy once, then edit.
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — from the Upstash console ([console.upstash.com](https://console.upstash.com/)). Create a free Redis database, copy the REST URL + REST token from its "REST API" panel. Without these, the leaderboard falls back to an in-memory Map that resets on every restart.
5. Trigger a redeploy after filling in `ALLOWED_ORIGIN`.

## How the build works

Render runs, in order:

```
npm install           # installs root + both workspaces (incl. devDependencies)
npm run build         # tsc --noEmit && vite build → client/dist
npm start             # cross-env NODE_ENV=production tsx server/src/index.ts
```

When `NODE_ENV=production`, the server:
- Serves `client/dist` as static files.
- Falls back to `client/dist/index.html` for any non-`/api/*` route (SPA routing).
- Restricts CORS to `ALLOWED_ORIGIN`.

## Post-deploy

1. Visit the Render URL. The app should load with an empty user picker.
2. Click **Import session from file** in the user picker and load the JSON you exported from localhost.
3. Confirm your history and estimates restore correctly.
4. Share the URL with friends.

## Known limits on the free tier

- **Ephemeral filesystem.** The grading log (`server/logs/grading.jsonl`) is written to local disk and will be lost on every redeploy or when the free-tier instance sleeps. The leaderboard is durable — backed by Upstash Redis (see setup above). Personal session data is client-side (`localStorage`), so individual users are unaffected.
- **Cold starts.** Free-tier services sleep after 15 min idle and take ~30s to wake on the first request.
- **Global grade cap.** `GLOBAL_DAILY_LIMIT=500` caps total `/api/grade` calls across all users per rolling 24h. Raise or lower via the env var.

## Rolling back

Render keeps prior deploys. Use **Manual Deploy → Deploy specific commit** or the **Rollback** button on any past deploy.
