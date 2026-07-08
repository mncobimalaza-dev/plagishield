# PlagiShield — Academic Integrity Platform

## What's in this version

- `/api/analyze` — calls Claude using an API key stored only as a server
  environment variable. The browser never sees it.
- `/api/register`, `/api/login`, `/api/logout`, `/api/me` — real accounts,
  stored in Redis, with passwords hashed using bcrypt. Sessions are signed,
  httpOnly cookies.
- `/api/forgot-password`, `/api/reset-password`, `reset-password.html` —
  self-service password reset via a one-time emailed link (30-minute expiry).
- `/api/history` — each user's last 20 scans (title, date, score) so they
  don't lose their results after closing the tab. Document text itself is
  never stored — only summary metadata.
- `terms.html`, `privacy.html` — starting-point legal pages, linked from the
  sign-in screen and required (checkbox) at registration. **Not legal
  advice** — see the note at the bottom of each page.
- Rate limiting on registration, login, password reset, and Claude analysis
  to protect both security and your API budget.

The document parsing (PDF/DOCX/TXT) and the Semantic Scholar / arXiv /
CrossRef / Wikipedia searches still run client-side — those are public,
keyless APIs, so there's nothing to protect there.

## Deploy for free (Vercel)

1. **Get an Anthropic API key**: console.anthropic.com → Settings → API Keys.
   Set a spend limit there too, as a safety net.
2. **Create a free Redis database**: console.upstash.com → Create Database
   → copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` shown
   on the database's REST API tab.
3. **Create a free Resend account** (for password reset emails):
   resend.com → sign up → API Keys → create one, copy it as
   `RESEND_API_KEY`. Until you verify your own domain there, emails can only
   be delivered to the address you signed up with — fine for testing, but
   verify a domain (resend.com/domains) before relying on this for real users.
4. **Generate a session secret**: run `openssl rand -base64 48` locally (or
   use any long random string generator) — this becomes `JWT_SECRET`.
5. **Push this folder to a GitHub repo.**
6. **Import the repo at vercel.com** ("Add New… → Project"). Vercel
   auto-detects the `/api` folder as serverless functions — no config needed.
7. In the Vercel project's **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY`
   - `JWT_SECRET`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `RESEND_API_KEY`
   - `EMAIL_FROM` (optional, defaults to a Resend sandbox address)
   - `ANALYZE_DAILY_LIMIT` (optional, defaults to 30)
8. Deploy. You'll get a free `your-project.vercel.app` URL immediately;
   a custom domain can be attached later, also free (you just pay the
   domain registrar, not Vercel).
9. **Before launching to real users:** open `terms.html` and `privacy.html`
   and fill in the `[bracketed placeholders]` (contact email, dates,
   pricing details) and have them reviewed — they're a solid starting
   template, not a finished legal document.

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

## Not yet built (good next additions)

- **Email verification on signup** — accounts currently work immediately
  after registering, with no confirmation the email address is real.
- **Export report as PDF** — useful for students submitting proof of an
  originality check.
- **Payments** (Stripe) — needed before you can actually charge for
  higher usage tiers.

## Notes / further hardening ideas

- Consider CAPTCHA on register/login if abuse becomes an issue.
- The daily analysis quota is per-account; you may also want a global
  budget alert in the Anthropic console.
- Rotate `ANTHROPIC_API_KEY` and `JWT_SECRET` immediately if this repo, or
  any earlier version of index.html with a key baked in, was ever made
  public.
