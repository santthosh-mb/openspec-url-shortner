## Why

We need a foundational link-shortening capability so users can convert long URLs into compact, shareable slugs and have those slugs redirect back to the originals. This is the core value proposition of the product and unlocks every downstream feature (analytics, custom domains, link management).

## What Changes

- Add `POST /api/tinyurl` endpoint that accepts a long URL and returns a 7-character base62 slug plus the full short URL.
- Add `GET /:slug` dynamic route that looks up the slug and issues an HTTP redirect to the stored long URL (404 if unknown).
- Generate slugs as 7-character base62 strings with a database collision check and bounded retry.
- Reserve `api`, `dashboard`, `admin`, and `_next` so they can never be issued as slugs (they collide with framework or product routes).
- Persist links via Prisma against a SQLite database; introduce the initial Prisma schema and migration.

## Capabilities

### New Capabilities
- `link-shortening`: Create short slugs from long URLs and redirect from a slug back to the original URL, with collision-safe slug generation, reserved-slug protection, and Prisma/SQLite persistence.

### Modified Capabilities
<!-- None — this is the first capability in the project. -->

## Impact

- **Code**: New `app/api/tinyurl/route.ts` handler, new `app/[slug]/route.ts` redirect handler, new `lib/` modules for slug generation and the Prisma client singleton.
- **Database**: New `prisma/schema.prisma` with a `Link` model (`id`, `slug` unique, `url`, `createdAt`); first SQLite migration committed under `prisma/migrations/`.
- **Dependencies**: `@prisma/client` and `prisma` were already present; this change adds `@prisma/adapter-better-sqlite3` and `better-sqlite3` (Prisma 7 requires a driver adapter for SQLite at runtime). SQLite file lives at `./dev.db` (gitignored).
- **Config**: `DATABASE_URL` environment variable required (defaults to `file:./dev.db` for local dev).
- **Routing**: The dynamic `[slug]` segment becomes a top-level catch for unmatched paths; reserved-slug list must stay in sync with any future top-level routes.
