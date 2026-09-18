# EduPlatform — Admin & Teacher Dashboard

A Next.js web application for administering the EduPlatform: courses, students,
teachers, access codes, support, notifications, logs and platform settings. It
is a **client of the existing NestJS backend** — it holds no database of its
own, duplicates no business rules, and every authorization decision it appears
to make is re-made, authoritatively, by the API.

---

## 1. Project overview

The platform has three parts. This is the third.

| Part | What it is | Who uses it |
| --- | --- | --- |
| `edu-backend` | NestJS + Prisma + PostgreSQL API | everything |
| `edu-mobile` | Expo / React Native app | students |
| `edu-dashboard` | this project | master admin, admins, teachers |

**Students cannot sign in here.** Their credentials are valid — the API
authenticates them perfectly well — but the dashboard refuses the session and
says so. Every screen behind the login is staff-only.

### The one architectural idea worth reading

The backend is a mobile-first API and issues **bearer tokens**. Bearer tokens in
a browser mean tokens in JavaScript, which means a single XSS is a full account
takeover. So the dashboard wraps them:

```
browser  ──►  this app's /api/proxy/*  ──►  NestJS API
   │                    │
   │                    └── attaches the access token (server-side)
   └── holds only an opaque HTTP-only cookie
```

- Tokens live in `HttpOnly`, `SameSite=Lax`, `Secure` cookies. Page scripts
  cannot read them; the end-to-end suite asserts this.
- The browser only ever talks to this application's own origin.
- One place refreshes an expired token and retries, instead of every feature
  growing its own 401 handling.
- Mutating requests require a custom header **and** a matching `Origin`, which
  together with `SameSite` closes CSRF.

`src/app/api/proxy/[...path]/route.ts` is the whole of it, and it is worth
reading before changing anything about authentication.

---

## 2. Requirements

- **Node.js 20.11 or newer** (22 LTS recommended)
- npm 10+
- A running instance of `edu-backend`, reachable from wherever this runs
- For the end-to-end suite only: a Chromium that Playwright can launch

---

## 3. Installation

```bash
cd edu-dashboard
npm install
cp .env.example .env.local     # then edit .env.local
```

---

## 4. Environment variables

`.env.example` is the complete list. Only one is required:

| Variable | Required | Default | What it does |
| --- | --- | --- | --- |
| `API_BASE_URL` | **yes** | `http://localhost:3000/api/v1` in dev | Base URL of the NestJS API, including its global prefix |
| `API_TIMEOUT_MS` | no | `20000` | How long to wait on the API for one request |
| `SECURE_COOKIES` | no | on in production | Adds `Secure` to session cookies. **Leave off over plain HTTP** — a Secure cookie is silently dropped, and login appears to do nothing |
| `APP_ORIGIN` | no | the request's origin | When set, the proxy refuses mutating requests from any other origin |
| `PLATFORM_TIMEZONE` | no | `Africa/Cairo` | Timezone every date is rendered in |
| `NEXT_PUBLIC_PLATFORM_TIMEZONE` | no | `Africa/Cairo` | The same value, for the browser. Keep the two in step |

There is deliberately **no** `NEXT_PUBLIC_API_URL`. See §1.

---

## 5. Development

```bash
npm run dev          # http://localhost:3001
```

The port is pinned to **3001** in `package.json`, not left to Next's default.
Next defaults to 3000, which is the port the backend listens on — and when the
dashboard wins that race, every request the proxy makes goes to the dashboard
itself, which answers its own 404 page. Pass `-- --port 3002` to use another.

The backend must be running. If `API_BASE_URL` is wrong the login screen still
renders and signing in reports that the API could not be reached — which is the
correct behaviour, not a bug.

---

## 6. Production build

```bash
npm run build
```

Type errors fail the build. Linting runs as its own step so a lint failure is
reported as a lint failure rather than as a mysterious build error.

---

## 7. Production start

```bash
npm run build
npm start            # http://localhost:3001; add -- --port 3002 to change it
```

**Deploying with Docker?** Add `output: 'standalone'` to `next.config.ts` and
start with `node .next/standalone/server.js`. It is off by default because it
makes `next start` refuse to run, and `npm start` working as documented matters
more than a smaller image for most installs.

---

## 8. Testing

```bash
npm run test:install   # once — downloads the Playwright browser
npm test               # 59 end-to-end tests
npm run test:ui        # the same suite, interactively
```

The suite starts **both** servers itself: a production build of the dashboard,
and a stub API (`e2e/stub-api/server.mjs`) standing in for NestJS. Nothing needs
to be running first, and it never touches a real database.

The stub replaces only the *upstream*. The dashboard under test is the real
build — real cookies, real proxy, real routing — which is what lets the suite
assert on things a live backend makes very hard to produce on demand:

- an expired access token mid-session, and the silent refresh-and-retry;
- a student's valid credentials being refused at the dashboard door;
- a teacher receiving 403 from the API for an admin-only endpoint;
- a cross-origin mutating request being rejected.

What it covers: authentication and role admission (master / admin / teacher in,
student out), session-cookie properties, sign-out, authorization for all three
roles at both the UI and the API, the proxy's CSRF defences and blocked
upstream paths, every navigation destination, access-code masking, the settings
switches, single-`h1`/skip-link accessibility, and responsive layout.

If Playwright cannot download a browser (a locked-down CI image), point it at
one you already have:

```bash
CHROMIUM_PATH=/usr/bin/chromium npm test
```

---

## 9. Linting and formatting

```bash
npm run lint          # ESLint (flat config), zero warnings expected
npm run lint:fix
npm run format        # Prettier
npm run typecheck     # tsc --noEmit, strict
npm run verify        # typecheck + lint + build, in that order
```

---

## 10. Backend URL configuration

`API_BASE_URL` must include the API's global prefix. The backend serves under
`/api/v1` by default, so:

```
API_BASE_URL=https://api.example.com/api/v1
```

not `https://api.example.com`. A wrong prefix shows up as every panel reporting
"That record could not be found."

The dashboard reads this **server-side only**. Changing it needs a restart, not
a rebuild.

---

## 11. Authentication flow

1. The operator submits phone + password to `POST /api/auth/login` (this app).
2. That route calls the backend's `POST /auth/login`.
3. If the account's role is `STUDENT`, or the account is not `ACTIVE`, the
   dashboard refuses and **writes no cookie**.
4. Otherwise the access and refresh tokens are written as `HttpOnly` cookies,
   along with a small non-sensitive profile cookie used to render the shell.
5. Every subsequent data request goes to `/api/proxy/...`, which attaches the
   access token server-side.
6. On a 401 the proxy refreshes once and retries. Refresh is serialised per
   process — the backend's refresh tokens are single-use and rotating, so two
   parallel refreshes would look like theft and revoke the whole family.
7. Sign-out revokes the session on the backend and clears the cookies. The
   cookies are cleared even if that call fails.

Forgotten passwords are reset by an administrator — the platform has no
self-service reset, and **no password is ever readable anywhere**: the backend
stores argon2id hashes and exposes no endpoint that returns them.

---

## 12. Roles

| Role | Can |
| --- | --- |
| **Master admin** | everything, including creating and managing admin accounts. Exactly one exists, and it is created out of band by `scripts/create-master.ts` — the API has no endpoint that creates or modifies it |
| **Admin** | every operational area: courses, students, teachers, codes, support, notifications, logs, settings. Not admin accounts |
| **Teacher** | their own courses only — content, their students, their analytics, notifications to their own students. What they may *do* inside those courses is further governed by four platform switches an admin controls |
| **Student** | nothing. Refused at sign-in |

The navigation hides what a role cannot use. **That is presentation, not
security** — the API refuses the same requests regardless, and the test suite
checks the API's refusal separately from the hidden menu.

---

## 13. Dashboard structure

```
src/
  app/
    (auth)/login/            sign-in
    (dashboard)/             the authenticated shell
      page.tsx               Statistics (admin) / Home (teacher)
      courses/               list, detail (content · students · notify · pricing),
                             structure (universities → colleges → departments)
      students/              accounts + blocked, profile drawer
      teachers/              accounts, create, set password
      codes/                 masked list, generate, reveal, cancel
      code-batches/          batches + per-batch Excel export
      support/               ticket inbox and conversations
      notifications/         broadcast / by course / by segment
      other-data/            subjects, academic years
      logs/                  admin action log, student login log
      admins/                admin accounts (master only)
      settings/              device limit, teacher switches, contacts
    api/
      auth/{login,logout,session}/    session routes
      proxy/[...path]/                the only door to the backend

  components/
    ui/          button, field, primitives, overlay, states, tabs, toast
    data/        data-table, filters, status badges, export-button
    layout/      shell, navigation model, icons

  features/      one folder per domain: hooks + screens
  lib/           backend client, session, errors, format, export, permissions
  types/         api envelope + domain mirrors of the Prisma enums

e2e/             Playwright specs + the stub API
```

### Conventions worth keeping

- **Server-side search, sort, filter and pagination.** Nothing is filtered in
  the browser, so a count, a table and an export always agree.
- **List state lives in the URL.** A filtered view can be sent to a colleague,
  Back returns to it, and a reload does not discard it.
- **Exports re-fetch the whole filtered result set**, not the visible page.
- **Three states, always**: loading, empty, error — and "no results for this
  filter" is worded differently from "something broke".
- **Destructive actions confirm with their consequence**, not with "are you
  sure?".

---

## 14. Things this dashboard deliberately does not do

Worth knowing before adding a feature that fights the platform:

- **It never produces a playable or downloadable video URL.** Video reaches a
  student only through a short-lived, per-viewer signed ticket. Those endpoints
  are blocked at the proxy, so an administrator's session cannot be used to
  bypass content protection.
- **It never shows a password.** Not a teacher's, not a student's, not an
  admin's. Only "set a new one", which revokes that account's sessions.
- **It does not delete business records.** Archiving a course, blocking a
  student, cancelling a code and archiving a lecture are all state changes.
  Purchases, revenue, code redemptions, watch history, audit logs and support
  conversations are retained.
- **Hiding a course is not revoking it.** A hidden course leaves the catalogue,
  but students who already have access keep it and keep watching. The
  confirmation dialog says so, because using "hide" to cut off paying students
  is the mistake this wording exists to prevent.
- **Codes are masked in tables.** Revealing or copying one is a deliberate act.

---

## 15. Manual setup

Nothing in this project requires manual setup beyond §3 and §4. What it depends
on lives in the backend:

1. **The backend must be migrated.** This dashboard requires the
   `20260907120000_dashboard_admin` migration (access-code targeting, code
   batches, support tickets, subjects, section entitlements, platform
   settings). Run `npm run prisma:deploy` in `edu-backend`.
2. **A master account must exist.** `npm run bootstrap:master` in
   `edu-backend`. The API cannot create one.
3. **Set `API_BASE_URL`**, including the `/api/v1` prefix.
4. **Serve over HTTPS in production**, or session cookies with `Secure` will be
   dropped. Set `SECURE_COOKIES=false` only for local HTTP development.
5. **If the dashboard is on a different origin from the API**, nothing special
   is needed — the browser never calls the API directly, so there is no CORS
   configuration to do. Only this application's server needs to reach it.
