# Vocabulary Sampler

Web app that estimates a user's vocabulary size by sampling words, asking the user to define them in their own words, grading the responses via the Gemini API, and reporting a probability distribution over vocabulary size that tightens as more answers are submitted.

## Core requirements

1. **Word sampling.** Draw words from a frequency-stratified dictionary so estimates can extrapolate from sample to total vocabulary. The Oxford English Dictionary itself is licensed and not freely available — start with a free, redistributable source and treat "OED" as aspirational:
   - Primary candidates: Wiktionary dumps, WordNet, the Free Dictionary API (dictionaryapi.dev), or Webster's 1913 (public domain).
   - The corpus must include word-frequency rank so sampling can be stratified (common, mid, rare, very rare bands).

2. **Definition prompt.** Show one word at a time. The user types a free-form definition. No multiple choice.

3. **Grading.** Send each (word, reference definition, user definition) triple to the Gemini API with a rubric that returns a graded score, not a binary right/wrong. Suggested levels: `precise` / `rough` / `gist` / `wrong` / `unknown`. The rubric must return structured output (JSON) so the client can aggregate.

4. **Estimation.** From per-word graded results, produce a posterior over the user's vocabulary size at each grade level — e.g., "with 90% credibility, you know precise definitions for between 18,000 and 23,000 words." Use a Bayesian model (Beta-Binomial per frequency band, then sum across bands weighted by band size) so the credible intervals tighten naturally as `n` grows. Display the distribution, not only point estimates.

5. **Session persistence.** A user must be able to close the tab mid-session and resume later with all prior answers and grades intact. Use a simple, low-friction mechanism — `localStorage` keyed by an anonymous session id (shown to the user as a resumable URL or copy-able token) is sufficient for v1. No login required.

## Non-goals (v1)

- User accounts, social features, leaderboards.
- Mobile-native apps — web only.
- Adaptive item selection (IRT). Stratified random sampling is the v1 baseline.
- Storing user data on a server — keep state client-side until there is a reason not to.

## Recommended stack (proposal — confirm before scaffolding)

- **Frontend:** Vite + React + TypeScript. Single-page app.
- **Backend:** Minimal Node/Express or a serverless function whose only job is to proxy Gemini calls so the API key never ships to the browser.
- **Storage:** `localStorage` for v1. Server stays stateless.
- **Stats:** Implement the Beta-Binomial aggregation in TypeScript so it runs client-side; no Python service needed.

## Security & secrets

- The Gemini API key MUST live server-side (env var, never committed). The frontend calls our proxy; the proxy calls Gemini.
- `.env` and `.env.local` belong in `.gitignore` from the first commit. Provide `.env.example` with placeholder values.
- Validate and length-cap user-submitted definitions before forwarding to Gemini (defense against prompt-injection / token-bomb).
- The Gemini grading prompt must instruct the model to ignore any instructions appearing inside the user's definition text.
- No PII is collected. Session id should be a random opaque token, not derived from anything identifying.
- CORS on the proxy: restrict to the deployed frontend origin.

## Open decisions (ask before assuming)

- Word source (Wiktionary vs WordNet vs other) and how frequency ranks are obtained.
- Hosting target (Vercel / Cloudflare Pages / self-hosted).
- Whether the proxy should rate-limit per session id to bound Gemini cost.
