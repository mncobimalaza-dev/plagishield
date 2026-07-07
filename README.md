# PlagiShield — Academic Integrity Platform
University of Eswatini (UNISWA) — CSC499 Capstone Project

## What changed in this version

The original build ran entirely in the browser, including a hardcoded
Anthropic API key and passwords "hashed" with `btoa()` (which is just
base64 — not encryption). That meant:
- Anyone viewing page source could steal the API key and spend your budget.
- Anyone could read every user's password out of localStorage in one line.
- Account data lived only on one browser/device, with no real login.

This version moves all of that server-side:
- `/api/analyze` — calls Claude using an API key stored only as a server
  environment variable. The browser never sees it.
- `/api/register`, `/api/login`, `/api/logout`, `/api/me` — real accounts,
  stored in Redis, with passwords hashed using bcrypt (industry standard,
  salted, slow-by-design). Sessions are signed, httpOnly cookies that
  JavaScript in the browser can't read or forge.
- Basic rate limiting: capped registration/login attempts per IP, and a
  per-user daily cap on Claude analyses so one account can't run up the
  whole bill.

The document parsing (PDF/DOCX/TXT) and the Semantic Scholar / arXiv /
CrossRef / Wikipedia searches still run client-side, as before — those
are public, keyless APIs, so there's nothing to protect there.

## Deploy for free (Vercel)

1. **Get an Anthropic API key**: console.anthropic.com → Settings → API Keys.
   Set a spend limit there too, as a safety net.
2. **Create a free Redis database**: console.upstash.com → Create Database
   → copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` shown
   on the database's REST API tab.
3. **Generate a session secret**: run `openssl rand -base64 48` locally (or
   use any long random string generator) — this becomes `JWT_SECRET`.
4. **Push this folder to a GitHub repo.**
5. **Import the repo at vercel.com** ("Add New… → Project"). Vercel
   auto-detects the `/api` folder as serverless functions — no config needed.
6. In the Vercel project's **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY`
   - `JWT_SECRET`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `ANALYZE_DAILY_LIMIT` (optional, defaults to 30)
7. Deploy. You'll get a free `your-project.vercel.app` URL immediately;
   a custom domain can be attached later, also free (you just pay the
   domain registrar, not Vercel).

(Netlify + Netlify Functions, or Cloudflare Pages + Workers, work the same
way if you'd rather use one of those — same steps, different dashboard.)

## Local testing

```
npm install
npx vercel dev
```
This runs the site and the `/api` functions together on localhost, reading
variables from a local `.env` file (copy `.env.example` to `.env` first —
`.env` is already gitignored so it won't get committed).

## Notes / further hardening ideas

- Consider adding email verification before an account can run analyses.
- Consider CAPTCHA on register/login if abuse becomes an issue.
- The daily analysis quota is per-account; you may also want a global
  budget alert in the Anthropic console.
- Rotate `ANTHROPIC_API_KEY` and `JWT_SECRET` immediately if this repo, or
  any earlier version of index.html with a key baked in, was ever made
  public.
"# plagishield" 
"# plagishield" 
"# plagishield" 
