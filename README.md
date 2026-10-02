# Clinic appointment booking

Next.js 15 (App Router) + TypeScript (strict) + Tailwind, backed by Supabase (Postgres + Auth) and
deployed on Vercel. See [docs/DESIGN.md](docs/DESIGN.md) and [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Local development

Requires Node.js 20.9+ (npm is the package manager per the design; `pnpm` also works if you prefer it).

```bash
npm ci --no-audit --no-fund      # or: npm install / pnpm install
cp .env.example .env.local       # then edit the values
npm run dev                      # http://localhost:3000 (binds 0.0.0.0, honours PORT)
```

| Script               | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Dev server (`HOST`-style bind to 0.0.0.0)    |
| `npm run build`      | Production build                             |
| `npm start`          | Run the production build (honours `PORT`)    |
| `npm test`           | Vitest unit/integration tests (offline)      |
| `npm run lint`       | ESLint                                       |
| `npm run typecheck`  | `tsc --noEmit`                               |
| `npm run format`     | Prettier                                     |
| `npm run migrate`    | Apply `supabase/migrations/*.sql`            |

## Environment variables

Copy `.env.example` to `.env.local` (git-ignored).

| Variable                         | Required | Example                                     | Notes                                                                                      |
| -------------------------------- | -------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `CLINIC_TZ`                      | yes      | `UTC`, `Europe/London`                      | IANA zone. No silent default: missing/invalid makes `/api/health` return 500.              |
| `HOLIDAYS`                       | no       | `2026-12-25,2027-01-01`                     | Closed dates, `YYYY-MM-DD`, comma-separated.                                               |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | yes      | `1x00000000000000000000AA` (test key)       | Public Cloudflare Turnstile site key. (A server-side secret is added with the CAPTCHA task.) |
| `SUPABASE_URL`                   | yes      | `https://abcd.supabase.co`                  | Supabase project URL.                                                                      |
| `SUPABASE_SERVICE_ROLE_KEY`      | yes      | `eyJ...`                                    | Server only. Never expose to the browser.                                                  |
| `DATABASE_URL`                   | for migrate | `postgresql://postgres:pw@db.abcd.supabase.co:5432/postgres` | Used by `npm run migrate`.                                            |
| `PORT` / `HOST`                  | no       | `3000` / `0.0.0.0`                          | `PORT` is read by Next.js; servers bind to `0.0.0.0`.                                      |

## Database setup (Supabase)

1. Create a Supabase project and copy the connection string into `DATABASE_URL`.
2. Run `npm run migrate`. It applies every file in `supabase/migrations/` in order and records them in
   `public.schema_migrations`; re-running is safe.
3. In Supabase Auth settings: disable public sign-ups, set minimum password length to 12, and create
   the single staff user manually (details come with the staff-auth task).

## Deploying to Vercel

1. Push the repository to GitHub/GitLab and import it in Vercel (framework preset: Next.js), or run
   `npx vercel link` locally to connect an existing project.
2. `vercel.json` already sets install/build commands and security headers (HSTS). Vercel redirects
   HTTP to HTTPS automatically.
3. Add all environment variables above under Project Settings → Environment Variables
   (Production and Preview). Set `CLINIC_TZ` explicitly.
4. Deploy, then check `https://<your-domain>/api/health` returns `{"status":"ok"}`.

## Troubleshooting

- **`/api/health` returns 500** – `CLINIC_TZ` is missing or not a valid IANA name (e.g. `Europe/London`).
- **`npm run migrate` fails with "DATABASE_URL is not set"** – create `.env.local` from `.env.example`.
- **Migration connection/SSL errors** – use the Supabase "Connection string" (direct or pooler) and make sure
  your network allows outbound port 5432/6543.
- **Port already in use** – set `PORT=3001` before `npm run dev`.
- **Tests** – `npm test` needs no network or database.
