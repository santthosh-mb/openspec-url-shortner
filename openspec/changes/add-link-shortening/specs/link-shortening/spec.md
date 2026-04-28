## ADDED Requirements

### Requirement: Shorten URL endpoint
The system SHALL expose a `POST /api/tinyurl` endpoint that accepts a JSON body containing a long URL and returns a JSON response containing a newly created short slug and the full short URL.

#### Scenario: Valid http URL is shortened
- **WHEN** a client sends `POST /api/tinyurl` with body `{ "url": "https://example.com/some/path" }`
- **THEN** the system persists a new `Link` record with the supplied URL and a freshly generated slug
- **AND** the response status is `201 Created`
- **AND** the response body contains `{ "slug": "<7-char-base62>", "shortUrl": "<origin>/<slug>" }`

#### Scenario: Missing or empty URL is rejected
- **WHEN** a client sends `POST /api/tinyurl` with body `{}` or `{ "url": "" }`
- **THEN** the response status is `400 Bad Request`
- **AND** the response body contains an `error` field describing the validation failure
- **AND** no `Link` record is created

#### Scenario: Non-http(s) URL is rejected
- **WHEN** a client sends `POST /api/tinyurl` with a URL whose protocol is not `http:` or `https:` (e.g. `javascript:alert(1)`, `data:text/html,...`, `ftp://...`)
- **THEN** the response status is `400 Bad Request`
- **AND** the response body contains an `error` field indicating the protocol is unsupported
- **AND** no `Link` record is created

#### Scenario: Malformed URL is rejected
- **WHEN** a client sends `POST /api/tinyurl` with a string that cannot be parsed as a URL (e.g. `"not a url"`)
- **THEN** the response status is `400 Bad Request`
- **AND** no `Link` record is created

### Requirement: Slug redirect endpoint
The system SHALL expose a `GET /:slug` route that resolves the slug to its stored long URL and issues an HTTP redirect, or returns `404` when the slug is unknown or reserved.

#### Scenario: Known slug redirects to original URL
- **WHEN** a client sends `GET /<slug>` for a slug that exists in the database
- **THEN** the response is an HTTP redirect (status `302` or `307`) whose `Location` header equals the stored long URL

#### Scenario: Unknown slug returns 404
- **WHEN** a client sends `GET /<slug>` for a slug that does not exist in the database
- **THEN** the response status is `404 Not Found`
- **AND** no redirect is issued

#### Scenario: Reserved slug returns 404 from the redirect handler
- **WHEN** a client sends `GET /<slug>` where `<slug>` is one of the reserved slugs (`api`, `dashboard`, `admin`, `_next`)
- **THEN** the redirect handler returns `404 Not Found` rather than performing a database lookup

### Requirement: Slug generation
The system SHALL generate slugs that are exactly 7 characters drawn from the base62 alphabet `[0-9A-Za-z]`, never collide with existing slugs, and never equal a reserved slug.

#### Scenario: Generated slug matches the format
- **WHEN** the slug generator produces a candidate
- **THEN** the candidate is exactly 7 characters long
- **AND** every character is in the set `[0-9A-Za-z]`

#### Scenario: Collision with existing slug triggers retry
- **WHEN** the slug generator produces a candidate that already exists as a `Link.slug` in the database
- **THEN** the system rejects the candidate and generates a new one
- **AND** the request only succeeds once a non-colliding candidate is produced

#### Scenario: Reserved candidate is rejected
- **WHEN** the slug generator produces a candidate that equals one of the reserved slugs (`api`, `dashboard`, `admin`, `_next`)
- **THEN** the system rejects the candidate and generates a new one
- **AND** the reserved slug is never written to the database

#### Scenario: Repeated collisions surface as a server error
- **WHEN** the slug generator fails to produce a non-colliding, non-reserved candidate within the configured retry budget (5 attempts)
- **THEN** the `POST /api/tinyurl` request responds with `500 Internal Server Error`
- **AND** no partial `Link` record is committed

### Requirement: Persistent link storage
The system SHALL persist every successfully created link in a SQLite database via Prisma, with a `slug` column that is uniquely indexed.

#### Scenario: Link survives process restart
- **WHEN** a link is created via `POST /api/tinyurl`
- **AND** the application process is restarted
- **THEN** `GET /<slug>` still resolves the slug and redirects to the original URL

#### Scenario: Database-level uniqueness on slug
- **WHEN** the Prisma schema is migrated
- **THEN** the `Link.slug` column has a unique constraint
- **AND** an attempt to insert a duplicate slug raises a unique-constraint violation that the slug generator can catch and retry on
