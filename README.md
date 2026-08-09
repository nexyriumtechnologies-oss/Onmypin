# OwnMyPin Backend — Phase 1 (Core Backend)

Digital identity / smart-address platform backend. **Phase 1 only**: auth + OTP, users,
properties, DigiPin generation, QR, location, media upload.

## Tech stack

- Next.js (App Router, API routes only) + TypeScript (strict)
- Prisma ORM + MySQL
- JWT auth (15 min access + 7 day rotating refresh tokens)
- Zod validation (strict on every route), central error handling, in-memory rate limiting
- Swagger UI docs (`/api/docs`) + Postman collection export

> **Frontend devs: start with [`API_REFERENCE.md`](./API_REFERENCE.md)** — every endpoint,
> exact request/response JSON, error codes, and the token flow.

## Folder structure

```
src/
  app/api/            -> thin route handlers only (each carries @swagger JSDoc)
    media/            -> upload + delete routes
    docs/             -> Swagger UI page + swagger-ui-dist assets
    openapi.json/     -> generated OpenAPI spec
  modules/
    auth/             -> OTP + session services
    users/
    properties/
    digipin/          -> DigiPin generation + state-code table
    qr/               -> opaque-token QR
    location/         -> Geocoder (Nominatim osm / mock) + GPS cross-check
    media/            -> StorageProvider (local disk) + busboy multipart + magic-byte validation
  lib/
    prisma.ts, jwt.ts, crypto.ts, response.ts, rateLimit.ts, logger.ts, env.ts, openapi.ts
    otp/              -> OtpProvider interface + console impl
  middleware/
    auth.ts           -> Bearer-token guard
    errorHandler.ts   -> withErrorHandler wrapper + ApiError
  middleware.ts       -> CORS allowlist enforcement
  instrumentation.ts  -> startup env validation (fails loudly on missing secrets)
scripts/
  export-postman.mjs  -> npm run export:postman
  openapi.definition.cjs -> shared OpenAPI definition
prisma/
  schema.prisma
  migrations/
postman/             -> generated collection output
```

## Setup

```bash
npm install

# 1. Environment — the server REFUSES to start with missing/placeholder secrets
cp .env.example .env   # fill DATABASE_URL + JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, OTP_HASH_SALT

# 2. Database (MySQL must be running)
mysql -uroot -e "CREATE DATABASE IF NOT EXISTS ownmypin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npx prisma migrate dev --name init

# 3. Run
npm run dev            # http://localhost:3000
```

Other scripts: `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`,
`npm run export:postman`, `npx prisma studio`, `npx prisma migrate deploy` (prod).

## API docs — Swagger UI

```bash
npm run dev
# open in a browser:
#   http://localhost:3000/api/docs     -> interactive Swagger UI
#   http://localhost:3000/api/openapi.json -> raw OpenAPI 3.0 spec
```

How to get a token to paste into the **Authorize** button:

1. `POST /api/auth/send-otp` with `{ "mobile": "9876543210" }`.
   With the dev `console` OTP provider, the 6-digit code is printed to the server log
   (search for `OTP for 9876543210:`).
2. `POST /api/auth/verify-otp` with `{ "mobile": "9876543210", "otp": "<code>" }`.
   Copy `accessToken` from the response.
3. In Swagger UI click the green **Authorize** button and paste:
   `Bearer <accessToken>` (the word `Bearer` + a space + the token).
4. Refresh a protected endpoint, e.g. `GET /api/users/me`. The token persists across
   reloads (`persistAuthorization`).

### Postman collection

```bash
npm run export:postman   # writes postman/ownmypin.postman_collection.json
```

Import it in Postman (File > Import). Set collection variables:
`baseUrl = http://localhost:3000` and `bearerToken` = the access token from
`POST /api/auth/verify-otp` (auth is pre-wired to the `Authorization` header).

## API surface (Phase 1)

| Method | Route                        | Auth | Notes                             |
| ------ | ---------------------------- | ---- | --------------------------------- |
| POST   | /api/auth/send-otp           | -    | rate limited: 3 / mobile / 10 min + IP layer |
| POST   | /api/auth/verify-otp         | -    | creates user on first login       |
| POST   | /api/auth/refresh            | -    | rotates refresh token; reuse revokes the whole session family |
| POST   | /api/auth/logout             | ✓    | revokes token + session           |
| GET    | /api/auth/me                 | ✓    |                                  |
| GET    | /api/users/me                | ✓    |                                  |
| PATCH  | /api/users/me                | ✓    | name/email/profileImage(fileId)/language/accountStatus |
| DELETE | /api/users/me                | ✓    | soft-delete + revoke all sessions |
| POST   | /api/media/profile-image | ✓    | multipart profile image (single slot, replaces previous) |
| POST   | /api/media/selfie        | ✓    | multipart selfie (single slot, replaces previous) |
| POST   | /api/media/property-images | ✓  | multipart property image (pool capped at 3, oldest evicted) |
| DELETE | /api/media/:fileId       | ✓    | owner-only delete                 |
| POST   | /api/properties              | ✓    | creates DRAFT                     |
| GET    | /api/properties              | ✓    | own properties only               |
| GET    | /api/properties/:id          | ✓    | owner-only (404 otherwise)        |
| PATCH  | /api/properties/:id          | ✓    | fills registration steps          |
| POST   | /api/properties/:id/submit   | ✓    | DRAFT→SUBMITTED; requires propertyImages (≥1) + selfieImage; lat/lng optional — server geocodes the address; generates DigiPin + QR |
| GET    | /api/digipins/:id/qr         | ✓    | opaque-token QR                   |
| POST   | /api/qr/verify               | -    | resolves token → public info only |
| POST   | /api/location/verify         | -    | geocodes the address (osm/mock); optional device GPS cross-checked (500 m) → verified |

Response envelope: `{ "success": true, "data": ... }`
Error envelope: `{ "success": false, "error": { "code", "message" } }`

### Media flow (Phase 1)

```text
1. POST /api/media/profile-image   (multipart: file=...)  -> { fileId, url }  (single slot — replaces old)
   POST /api/media/selfie          (multipart: file=...)  -> { fileId, url }  (single slot — replaces old)
   POST /api/media/property-images (multipart: file=...)  -> { fileId, url }  (pool: max 3, 4th evicts oldest)
2a. PATCH /api/users/me                 { profileImage: "<fileId from profile-image>" }
2b. POST /api/properties/:id/submit     { ..., propertyImages: ["<fileId from property-images>", ...], selfieImage: "<fileId from selfie>" }
3. DELETE /api/media/:fileId       (owner-only; 404 for anything else)
```

The upload pipeline is shared: busboy multipart with a **stream-level 5 MB cap**
(oversized files never buffer fully) and **magic-byte sniffing** (JPEG/PNG/WebP/HEIC —
client MIME/extension never trusted). Files are stored under `STORAGE_LOCAL_DIR`
(default `./public/uploads`), served by Next.js at `/uploads/...`.

## DigiPin format

`[2-letter state code][4-digit crypto-random][last 2 pincode digits]` — e.g. `WB472801`.
Uniqueness is enforced by the DB `@@unique` constraint with retry-on-collision
(no pre-check-then-insert). Generation is server-side only.

## Swappable providers

| Concern       | Interface                      | Default (dev)        | Env var            |
| ------------- | ------------------------------ | -------------------- | ------------------ |
| OTP sending   | `OtpProvider.sendOtp`          | Console (logs code)  | `OTP_PROVIDER`     |
| Storage       | `StorageProvider` (upload/signedUrl/delete) | Local disk | `STORAGE_PROVIDER` |
| Location      | `Geocoder.geocode`           | Nominatim `osm` (free, keyless)  | `LOCATION_PROVIDER`|
| Rate limiting | `RateLimiter.consume`          | In-memory            | `RATE_LIMIT_BACKEND`|

## Environment variables (security-critical)

| Var                 | Required | Notes                                                        |
| ------------------- | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`      | ✓        | MySQL DSN for Prisma                                         |
| `JWT_ACCESS_SECRET` | ✓        | ≥32 chars, must differ from refresh secret; no fallback, server fails to start otherwise |
| `JWT_REFRESH_SECRET`| ✓        | ≥32 chars, must differ from access secret                    |
| `OTP_HASH_SALT`     | ✓        | ≥16 chars; OTPs are SHA-256(salt:code) — never stored plain  |
| `CORS_ALLOWED_ORIGINS` | ✓ (dev default) | Comma-separated origin allowlist (Flutter app + Admin Panel domains); browser origins outside it get 403 |
| `STORAGE_LOCAL_DIR` | -        | Default `./public/uploads`                                   |
| `OTP_PROVIDER` / `LOCATION_PROVIDER` / `RATE_LIMIT_BACKEND` / `STORAGE_PROVIDER` | - | Swap provider impls |

## TODOs / stubs (fill in for production / Phase 2)

1. **OTP provider** — real SMS (MSG91/Twilio/AWS SNS): implement `OtpProvider`, register in `src/lib/otp/`, set `OTP_PROVIDER`.
2. **Storage** — S3/GCS provider behind `StorageProvider`; set `STORAGE_*` envs.
3. **Location** — Google Maps geocoder behind `Geocoder` (`LOCATION_PROVIDER=google`, `GOOGLE_MAPS_API_KEY`); Nominatim `osm` is already live.
4. **Rate limiter** — Redis-backed implementation behind `RateLimiter`.
5. **Property↔media persistence** — the submit gate validates propertyImages/selfieImage ownership, but the mapping is not yet stored on the Property row (Phase 2).
6. **Logging** — swap `src/lib/logger.ts` for pino/structured transport.
7. **DB cleanup** — expired OTP cleanup job, session pruning.
