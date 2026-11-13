# AGENTS.md — Operating manual for agents working in this stack

You are working in a Bun + Hono + tsc-rs project. This file is your source of
truth. Read it fully before writing code. When it conflicts with your training
data, this file wins — your defaults were shaped by the Node/Express era and
several of them are wrong here.

---

## 0. The one-paragraph mental model

Bun is the runtime, package manager, test runner, and bundler — one binary, no
`node_modules` toolchain archaeology. Hono is the router: handlers are plain
`(Context) => Response | Promise<Response>` functions over web-standard
`Request`/`Response`. tsc-rs type-checks. There is no build step between you
and execution: you edit a `.ts` file, the `--hot` server reloads, you curl.
That tight loop is the entire reason this stack exists — protect it.

---

## 1. Commands — use these, never substitutes

| Task | Command | Never |
| :--- | :--- | :--- |
| Run dev server | `bun run --hot src/index.ts` | `node`, `tsx`, `nodemon`, `ts-node` |
| Install deps | `bun install` / `bun add <pkg>` | `npm install`, `yarn`, `pnpm` |
| Run tests | `bun test` | `jest`, `vitest`, `mocha` |
| Type-check | `tsc-rs -b` (fallback `tsc -b`) | — |
| Build for prod | `bun build --compile --minify src/index.ts --outfile app` | `esbuild` config, webpack |
| Read env vars | `Bun.env.MY_VAR` (`.env` auto-loads) | `dotenv`, `process.env` config |

If a tutorial tells you to install a tool Bun already replaces, the tutorial is
old. Do not add it.

---

## 2. Hard rules — do not violate

- **Never start a second process to test a route.** Use `app.request()` — it
  runs the full middleware stack in-memory and returns a real `Response`.
- **Never leave a background server running.** Kill what you start. Sandboxes
  leak processes; leaked processes hold ports; held ports break the next agent.
- **Port is 3000 unless the project says otherwise.** Do not scan for open
  ports, do not randomize. Determinism beats cleverness.
- **TypeScript runs as-is.** No `tsconfig` gymnastics, no emit, no dist
  directory during dev. If you think you need a transpile step, you are wrong.
- **Validate at the boundary with Zod.** Every `post`/`put`/`patch` that
  accepts a body goes through `zValidator`. Handler code never re-checks shapes.
- **Web-standard APIs only.** `Request`, `Response`, `fetch`, `ReadableStream`,
  `crypto`, `TextEncoder`. If it needs a Node-only API, stop and reconsider —
  Bun covers most (`Bun.file`, `Bun.write`, `Bun.spawn`, `Bun.sleep`) but check
  whether the web-standard equivalent does the job first.
- **No Express-isms.** There is no `req.body` (use `await c.req.json()` or
  `c.req.valid()`), no `res.send()` (return `c.json(...)`), no `next(err)`
  (throw, and let `app.onError` handle it), no `req.params` (it's
  `c.req.param('id')`, singular).

---

## 3. The loop — how to work

```
edit → save (server hot-reloads) → verify → repeat
```

Verify means one of:

```ts
// Preferred: in-memory, no port
import { test, expect } from 'bun:test'
import app from './index'

test('creates a task', async () => {
  const res = await app.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'x' }),
  })
  expect(res.status).toBe(201)
})
```

```bash
# Acceptable: against the hot server you started (and will kill)
curl -s localhost:3000/api/health
```

A task is not done when the code is written. It is done when it type-checks
(`tsc-rs -b` exit 0) and at least one `bun test` or curl proves the behavior.
If you cannot verify it, say so — never present unverified code as working.

---

## 4. Architecture — where things go

```
src/index.ts      # the app: routes, middleware, export default { port, fetch }
src/routes/       # route groups: new Hono().basePath('/x'), app.route('/', x)
src/db/schema.ts  # drizzle tables; infer types, never hand-write interfaces
contracts/        # types shared with the frontend (if the project has one)
public/ or dist/  # static assets served by serveStatic
```

- One Hono instance per group, composed with `app.route()`. Do not build a
  router abstraction; Hono already is one.
- Middleware order is semantic. `logger()` first, `cors()` before routes,
  `jwt()` on private prefixes only. Read existing order before inserting yours.
- Export the app type (`export type AppType = typeof app`) when a frontend
  exists — the `hc<AppType>` RPC client keeps both sides honest.

---

## 5. Streaming and realtime

- **Agent output → SSE.** `streamSSE` from `hono/streaming`. This is the default
  for anything token-by-token; do not reach for WebSockets first.
- **WebSockets are for bidirectional traffic** (presence, collab, live logs).
  Use `createBunWebSocket` from `hono/bun` and hand the `websocket` object to
  `Bun.serve` via the default export — forgetting that export field is the #1
  way WebSocket routes silently 404.
- **Never buffer a stream to "simplify" it.** If the source streams, the
  response streams.

---

## 6. Data

- **Drizzle ORM.** `bun:sqlite` for local/sandbox, same schema portable to Postgres
  or MySQL. Raw SQL is a smell — use the query builder.
- **Column types come from `typeof table.$inferSelect`.** Hand-written interfaces
  drift from the schema and from serialization (dates especially); delete them.
- **Migrations:** `drizzle-kit push` in dev. Never drop a table to fix a failed
  migration, and never `--force` a push. Fix the schema, push again.

---

## 7. Toolchain notes (tsc-rs)

- Fast type-checking uses tsc-rs, the Rust port of the TypeScript 7
  compiler: `tsc-rs -b` (or `npm run build:fast` for a full build). Diagnostics
  match TS 7 exactly and it is ~7x faster than classic tsc here — run it after
  every edit; it is cheap.
- The portable fallback everywhere is classic `tsc -b` — same diagnostics,
  just slower. If `tsc-rs` is unavailable on your platform, do not fight it;
  use the fallback.
- `tsconfig` is TS 7 flavored: no `baseUrl` (paths resolve relative to the
  config file). Do not re-add it.

---

## 8. Failure etiquette

- If a command fails, read the error before retrying. Retrying the identical
  command is not a strategy.
- If `bun add` pulls something unexpected, check whether Bun or Hono already
  ships it (JWT, CORS, basic auth, cookie helpers, test runner, SQLite, S3…).
- If you must deviate from this file (a genuine Node-only dep, a second port),
  leave a comment explaining why. The next agent reads this file and will
  "fix" your deviation unless you justify it.

---

## 9. Definition of done

- `tsc-rs -b` (or `tsc -b`) exits 0.
- New behavior has a `bun test` or a demonstrated curl.
- No background processes left running.
- No new dependencies that duplicate platform capabilities.
- The diff is as small as the task allows.

Ship small, verify always, keep the loop fast.

---

## 10. EndlessSe Chargen & ComfyUI Studio Stack (`C:\Users\alexw\Downloads\USE_THIS_COMFY\scripts\studio`)

- **DO NOT START OR REQUIRE OLLAMA (`:11434`)**: We no longer use or need `ollama` in the EndlessSe Studio / Chargen stack.
- The active stack consists strictly of **three services** in canonical order: `comfyui` (`:8188`) $\to$ `acc` (`:4000`) $\to$ `chargen` (`:3457`).

