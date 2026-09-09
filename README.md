# SINO G

**Stop asking the group chat. See who's free.**

SINO G is a social coordination app designed to answer one question:

> "Sino ang G?"

SINO G helps friend groups coordinate plans by showing who's available, finding the best time to hang out, creating hangout requests, and letting members respond with:

- 🔥 **I'm Down**
- ⏳ **Maybe**
- ✕ **Can't**

## Tech Stack

- React + TypeScript + Vite
- React Router (lazy-loaded routes)
- TanStack React Query
- Supabase (Auth, PostgreSQL, Realtime, Storage)
- Tailwind CSS + shadcn-style UI + Lucide icons
- Cloudflare Pages (hosting)

## Installation

```bash
git clone https://github.com/Cartiace24/Sino-G.git
cd Sino-G
npm install
```

## Environment Variables

Copy the example file and fill in your own Supabase project values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Your Supabase anonymous (publishable) key |

Never commit real credentials — `.env.local` is git-ignored. Never use a `service_role` key in this frontend.

## Run Locally

```bash
npm run dev                  # http://localhost:5173
```

## Production Build

```bash
npm run build                 # typechecks (tsc) and emits dist/
npm run typecheck             # tsc --noEmit only
```

## Supabase Setup

1. Create a project at supabase.com.
2. **Auth → Providers**: enable Email + Google (OAuth client + redirect to
   `https://<your-app>/today`).
3. **SQL Editor** (or `supabase db push`): run the migrations in order —
   `0001_init` (tables, RLS, triggers, invites, storage, realtime) through
   `0011_group_chat` (group messages + `new_message` notifications).
   See `supabase/migrations/` for per-file details.
4. Full `auth.users` wipe on account deletion is intentionally out of RLS
   scope — remove users via Dashboard → Authentication or the Admin API.

## Deploy (Cloudflare Pages)

- Build command: `npm run build` · Output directory: `dist`.
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- SPA fallback: `public/_redirects` (`/* /index.html 200`) ships in `dist/`
  automatically — covers deep links, refreshes, lazy chunks, and
  OAuth/password-reset callback URLs.
- Add the production URL to Supabase Auth → URL Configuration.

## Notes

- The original vanilla prototype is preserved under `legacy-vanilla/`.
- Availability is stored as ranges; 30-minute scoring slots are computed
  in `src/utils/availability-calculator.ts`, never stored.
- Notification and device preferences are per-device (`localStorage`).
