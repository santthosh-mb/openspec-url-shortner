## Context

This is the first feature in a fresh Next.js 16 (App Router) + React 19 project. `package.json` already includes `prisma` and `@prisma/client` 7.x as dependencies, but no Prisma schema, migrations, or runtime code exist yet. The repo `AGENTS.md` warns that this Next.js version has breaking changes vs. older training data — most notably, route handler `params` is a `Promise` and is awaited.

We need to land the smallest credible vertical slice: a JSON endpoint that mints a short slug, a redirect handler that resolves a slug to a long URL, and the persistence layer underneath them. Everything else (auth, custom slugs, analytics, expiration, rate limiting) is deliberately deferred.

## Goals / Non-Goals

**Goals:**
- `POST /api/tinyurl` returns a 7-character base62 slug for a valid URL, and is idempotent in spirit (same long URL may return a new slug — see Decisions).
- `GET /:slug` issues an HTTP redirect to the stored URL when the slug exists, and 404s otherwise.
- Slugs are guaranteed unique via DB-level uniqueness plus an in-flight collision retry.
- Reserved slugs (`api`, `dashboard`, `admin`, `_next`) can never be issued.
- All link data is persisted to a SQLite database via Prisma so the slug survives process restarts.

**Non-Goals:**
- User accounts, auth, or per-user quotas.
- Custom slugs supplied by the caller.
- Click analytics, expirations, password-protected links, or link deletion.
- Rate limiting and abuse prevention beyond basic input validation.
- Production-grade DB (Postgres); SQLite is sufficient for this slice.
- A web UI — this change is API + redirect only.

## Decisions

### Slug format: 7-character base62, random
- **Choice**: Generate slugs by drawing 7 characters uniformly from `[0-9A-Za-z]` (62 symbols) using `crypto.randomBytes` with rejection sampling to avoid modulo bias.
- **Why**: 62^7 ≈ 3.5 trillion possible slugs gives ample headroom for collision rarity and abuse-resistance (slugs aren't enumerable). Random + DB collision check is dramatically simpler than a sequential ID + base62 encoder, and avoids leaking link counts via slug ordering.
- **Alternatives considered**: (a) `nanoid` with a custom 62-char alphabet — fine, but adds a dependency for ~15 lines of code we already need to write. (b) Auto-increment ID encoded to base62 — leaks creation order and total count, and forces us to either pad to 7 chars (collisions with future growth) or live with variable-length slugs.

### Collision handling: retry up to N attempts, then 500
- **Choice**: On insert, catch Prisma unique-constraint violation (P2002) and retry slug generation up to 5 times. If all 5 collide, return HTTP 500.
- **Why**: At our scale, the birthday-bound for one collision in 7-char base62 is ~1.9M links — five sequential collisions is statistically impossible until well past that. Retry cap prevents an infinite loop if something is wrong (e.g., the RNG is broken or the alphabet is wrong) and lets us alert on it rather than hang the request.
- **Alternatives considered**: (a) Generate-then-check with a `findUnique` before insert — has a TOCTOU race, costs an extra query, and the unique index already enforces correctness. (b) Single attempt — fragile once the table grows.

### Reserved slug enforcement: in-code constant, checked before insert
- **Choice**: Keep the reserved list as an exported constant in `lib/reserved-slugs.ts` (`['api', 'dashboard', 'admin', '_next']`). The slug generator rejects any candidate in this set and tries again. The redirect handler also short-circuits these slugs to 404.
- **Why**: A code-level constant is trivial to audit and version. Putting it in the DB means a new top-level route requires a data migration, which is worse ergonomics. The check happens at generation time so reserved slugs simply never make it into the table.
- **Alternatives considered**: A reserved-slugs DB table — overkill for four entries. Relying purely on Next's routing precedence (where literal routes outrank `[slug]`) — works for `api` and `_next`, but not future routes; the explicit list is defense-in-depth and prevents accidental link issuance even if no top-level route exists yet.

### Persistence: Prisma + SQLite, single `Link` model
- **Choice**: One model — `Link { id String @id @default(cuid()), slug String @unique, url String, createdAt DateTime @default(now()) }` — with a unique index on `slug`.
- **Why**: SQLite is zero-config for local dev and matches the deps already in `package.json`. Cuid for `id` keeps the table addressable without exposing internal counts. Unique index on slug is what makes the collision-retry strategy correct.
- **Alternatives considered**: Postgres — better for production, but premature here; the schema migrates cleanly later. Storing the slug as the primary key — saves a column but complicates eventual analytics joins (`linkId` foreign keys are nicer than slug strings).

### URL validation: `new URL()` + http(s) protocol allow-list
- **Choice**: Parse the input with the WHATWG `URL` constructor and require `protocol` to be `http:` or `https:`. Reject everything else (including `javascript:`, `data:`, `file:`).
- **Why**: Built-in, no dependencies, and protects against the obvious open-redirect-as-XSS vector where someone shortens `javascript:alert(1)` and a downstream consumer renders it without re-validating.
- **Alternatives considered**: A regex — error-prone and underspecified. A dedicated library like `valid-url` — unnecessary since `URL` is in Node's standard library.

### Prisma client singleton
- **Choice**: Export a single `PrismaClient` from `lib/prisma.ts` using the standard `globalThis` cache pattern so HMR in dev doesn't spawn a connection per reload.
- **Why**: Without this, `next dev` leaks DB connections every time a route file changes.

## Risks / Trade-offs

- **Random slug → no idempotency**: Shortening the same URL twice yields two different slugs. → Acceptable for v1; if we later want idempotency, add an optional `findFirst({ where: { url } })` lookup behind a flag without changing the API shape.
- **SQLite single-writer concurrency**: Under heavy parallel writes SQLite serializes transactions, which could surface as latency. → Fine for dev/local; document that we'll move to Postgres before any real traffic.
- **Reserved-slug list drift**: A future PR could add a top-level route (`/about`, `/pricing`) without updating the reserved list, allowing a slug to shadow the new route. → Mitigation: add a comment in `lib/reserved-slugs.ts` pointing maintainers at it, and revisit when we add the next top-level route.
- **No rate limiting**: An attacker could exhaust the slug space or fill the DB. → Out of scope for this change; tracked as a follow-up. SQLite size is the practical bound for now.
- **`GET /:slug` is a catch-all at the root**: Any unmatched top-level path will hit the redirect handler. A typo like `/favicon.icoo` returns 404 from the handler rather than from Next's static asset pipeline. → Acceptable; the 404 is correct, just sourced from a different layer.

## Migration Plan

This is a greenfield feature; there is no prior version to migrate from. Deploy steps:
1. Install Prisma CLI and run `npx prisma migrate dev --name init` to create the SQLite DB and the initial migration (`prisma/migrations/<timestamp>_init/`).
2. Commit `prisma/schema.prisma`, the migration directory, and add `prisma/dev.db` + `prisma/dev.db-journal` to `.gitignore`.
3. Add `DATABASE_URL="file:./dev.db"` to `.env` (and document in README).
4. No rollback needed beyond `git revert` — the SQLite file is local.
