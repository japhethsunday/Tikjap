<div align="center">

<img src="public/logo.svg" alt="Tikjap AI logo" width="220" />

# Tikjap AI

**A fast, production-ready AI assistant built with Next.js**

Streaming chat, multiple models, file attachments, conversation history, and an admin dashboard — with a self-contained demo backend so it works end-to-end out of the box.

</div>

## ✨ Features

- **Streaming chat** — token-by-token SSE responses with stop, retry, regenerate, and edit-and-resend
- **Multiple models** — pick from a backend-driven catalog (`tikja-mini` → `tikja-1-pro`, plus a vision model)
- **File attachments** — images & documents (10 MB max, 4 per message), validated server-side
- **Conversation history** — search, rename, delete, and auto-generated titles
- **Full auth** — signup, login, forgot/reset password, session management, "sign out other devices"
- **Settings** — account, appearance (light/dark/system), AI preferences, usage quotas, security
- **Admin dashboard** — platform metrics, model usage, request success rates (role-gated)
- **Demo backend** — bundled API (`/api/v1/*`) with seeded accounts, rate limits, and a persistent JSON store; point `NEXT_PUBLIC_API_BASE_URL` at a real backend for production

## 🚀 Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> Copy `.env.example` to `.env.local` and adjust as needed. Demo mode is the default.

**Demo accounts**

| Role  | Email               | Password   |
| ----- | ------------------- | ---------- |
| User  | `demo@tikjap.dev`   | `demo1234` |
| Admin | `admin@tikjap.dev`  | `admin1234` |

## ☁️ Deploy to Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com), **Add New → Project** and import the repo.
3. Vercel auto-detects Next.js — no build settings required. Add these environment variables (all optional):

   | Variable                     | Demo (default) | Production                    |
   | ---------------------------- | -------------- | ----------------------------- |
   | `NEXT_PUBLIC_APP_MODE`       | `demo`         | `live`                        |
   | `NEXT_PUBLIC_APP_NAME`       | `Tikjap AI`    | your product name             |
   | `NEXT_PUBLIC_BILLING_ENABLED`| `true`         | `false`                       |
   | `NEXT_PUBLIC_API_BASE_URL`   | `/api/v1`      | `https://api.example.com/v1`  |

4. **Deploy.**

**Important — demo data on serverless:** the bundled demo backend writes to a JSON store. On Vercel that store lives in `/tmp`, which is ephemeral — data (accounts, conversations, uploads) can reset on redeploys or cold starts. That is intentional for demos. For durable storage, deploy the API separately and set `NEXT_PUBLIC_API_BASE_URL` to it.

## 🧪 Verification

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # Vitest (43 tests)
npm run build       # production build
```

## 🏗️ Architecture

```
app/
  (auth)/            signup, login, forgot/reset password
  (app)/             authenticated shell: chat, settings, admin
  (marketing)        landing page (root /)
  api/v1/*           demo backend route handlers (SSE streaming, auth, files…)
components/
  chat/              composer, message, markdown, model selector, chat view
  providers/         theme, query, toast, auth providers
  settings/          settings navigation
  sidebar/           app shell + conversation sidebar
  ui/                primitives (button, field, overlays, avatar, tabs…)
lib/
  api/               typed API client, services, SSE parser
  types/             shared domain types
server/              demo backend: db store, auth, chat, files, usage, seed
proxy.ts             route protection (Next.js proxy convention)
```

## 🔒 Security

- Passwords hashed with `scrypt` + per-user salt; timing-safe comparison
- Opaque session tokens stored hashed (sha-256), delivered as httpOnly, SameSite cookies
- Server-side authorization (role checks, resource ownership) on every route
- Upload validation: allowlist of extensions, size caps, per-user isolation
- Markdown rendered without `rehype-raw`; security headers via `next.config.ts`

## 📄 License

MIT