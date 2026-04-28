## 1. Database & Prisma setup

- [x] 1.1 Create `prisma/schema.prisma` with the SQLite datasource (`provider = "sqlite"`, `url = env("DATABASE_URL")`) and a `Link` model: `id String @id @default(cuid())`, `slug String @unique`, `url String`, `createdAt DateTime @default(now())`.
- [x] 1.2 Add `DATABASE_URL="file:./dev.db"` to `.env` and document it in `README.md`.
- [x] 1.3 Update `.gitignore` to exclude `prisma/dev.db`, `prisma/dev.db-journal`, and `.env` (if not already covered).
- [x] 1.4 Run `npx prisma migrate dev --name init` and commit the generated migration directory under `prisma/migrations/`.
- [x] 1.5 Add a `db:migrate` script (or equivalent convenience command) to `package.json` so contributors can re-run migrations.

## 2. Core lib modules

- [x] 2.1 Create `lib/prisma.ts` exporting a `PrismaClient` singleton via the standard `globalThis` cache pattern so HMR doesn't leak connections.
- [x] 2.2 Create `lib/reserved-slugs.ts` exporting `RESERVED_SLUGS = ['api', 'dashboard', 'admin', '_next'] as const` plus an `isReservedSlug(slug: string): boolean` helper. Include a comment reminding maintainers to update this list when adding new top-level routes.
- [x] 2.3 Create `lib/slug.ts` with `generateSlug(): string` that draws 7 chars from the base62 alphabet using `crypto.randomBytes` with rejection sampling (no modulo bias).
- [x] 2.4 In `lib/slug.ts`, add `createUniqueLink(url: string): Promise<{ slug: string }>` that loops up to 5 times: generate slug → skip if reserved → attempt `prisma.link.create` → on Prisma error code `P2002` retry, otherwise rethrow. Throws after 5 collisions.
- [x] 2.5 Create `lib/url.ts` exporting `parseSafeUrl(input: unknown): URL | null` that validates the input is a string, parses with `new URL(...)`, and returns `null` unless `protocol` is `http:` or `https:`.

## 3. POST /api/tinyurl route handler

- [x] 3.1 Create `app/api/tinyurl/route.ts` exporting an async `POST` handler.
- [x] 3.2 Read and JSON-parse the request body; on parse failure return `400` with `{ error: "Invalid JSON body" }`.
- [x] 3.3 Validate the URL via `parseSafeUrl`; on failure return `400` with `{ error: "Invalid or unsupported URL" }`.
- [x] 3.4 Call `createUniqueLink(url)`; on the "5 collisions" throw return `500` with `{ error: "Could not generate a unique slug" }`.
- [x] 3.5 Build the short URL from the request's origin (`new URL(request.url).origin`) and return `201` with `{ slug, shortUrl }`.

## 4. GET /:slug redirect handler

- [x] 4.1 Create `app/[slug]/route.ts` exporting an async `GET` handler that takes `(_req, ctx: RouteContext<'/[slug]'>)`.
- [x] 4.2 Await `ctx.params` to read `slug` (Next 16 makes `params` a Promise).
- [x] 4.3 If `isReservedSlug(slug)` return `new Response(null, { status: 404 })` immediately.
- [x] 4.4 Look up the link with `prisma.link.findUnique({ where: { slug } })`; if not found return `404`.
- [x] 4.5 Return `Response.redirect(link.url, 307)` for the success path.

## 5. Manual verification

- [x] 5.1 Run `npm run dev`, then `curl -X POST http://localhost:3000/api/tinyurl -H 'content-type: application/json' -d '{"url":"https://example.com"}'` and confirm a `201` with a 7-char base62 `slug` and matching `shortUrl`.
- [x] 5.2 Visit the returned `shortUrl` in a browser (or `curl -I`) and confirm it issues a `307` redirect with the `Location` set to `https://example.com`.
- [x] 5.3 Confirm `curl -I http://localhost:3000/zzzzzzz` (a slug that doesn't exist) returns `404`.
- [x] 5.4 Confirm `curl -I http://localhost:3000/admin` returns `404` from the redirect handler (reserved slug).
- [x] 5.5 Confirm `POST /api/tinyurl` with `{ "url": "javascript:alert(1)" }`, `{ "url": "" }`, and `{ "url": "not a url" }` each return `400`.
- [x] 5.6 Restart `npm run dev` and confirm a previously created `shortUrl` still redirects (persistence check).
