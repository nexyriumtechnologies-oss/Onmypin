# OwnMyPin Backend — Phase 1 Implementation Document

Date: 2026-08-09
Scope: Phase 1 — Core Backend (per SOW Milestone 1 scope: database, auth/OTP, users, properties, DigiPin, QR, location, media abstraction).

---

## 1. Stack decision notes

| Choice | Value | Reason |
|---|---|---|
| Framework | Next.js 15 (App Router, API routes only) | Per prompt; no frontend pages built |
| Language | TypeScript strict mode | `strict: true` + `noUncheckedIndexedAccess` |
| ORM / DB | Prisma 6 / **MySQL** | Prompt said MySQL. **Note: the SOW PDF says PostgreSQL — flag for client decision.** |
| Auth | JWT (jsonwebtoken), access 15 min / refresh 7 days, rotation | Standard, revocable refresh tokens stored hashed in DB |
| Validation | Zod v3 | Every route validates; 400 on failure |
| Tests | Vitest | 3 files, 17 tests, no DB required (services accept injected persistence) |
| Tooling | ESLint (flat, next/core-web-vitals) + Prettier | `lint`, `typecheck`, `format` scripts |

## 2. Database (prisma/schema.prisma)

MySQL provider, `cuid()` PKs, `createdAt`/`updatedAt` everywhere applicable. Models:

- **User** — mobile (unique), email (unique, optional), name, profileImage, language, accountStatus enum (ACTIVE/DEACTIVATED/DELETED)
- **OtpRecord** — mobile, otpHash (never plain OTP), purpose, expiresAt, attempts, verified
- **Session** — userId, deviceInfo, createdAt, expiresAt
- **RefreshToken** — userId, tokenHash (unique), expiresAt, revoked, revokedAt
- **DeviceToken** — userId, fcmToken, platform enum
- **Property** — ownerName, propertyType/ownershipType enums, address, city, state, pincode, lat/lng (Decimal), verificationStatus enum (DRAFT…INACTIVE)
- **DigiPin** — propertyId (unique), digipinNumber (`@@unique`), status, verificationStatus
- **QR** — digipinId (unique), qrData, qrStatus, customization (Json?)

Relations: User 1—N Property, Property 1—1 DigiPin, DigiPin 1—1 QR. All user-owned rows cascade on user delete.

Initial migration `20260809061937_init` applied to local `ownmypin` database.

## 3. Architecture

```
src/
  app/api/          -> thin route handlers (validation + delegate to service)
  modules/          -> business logic per domain, no HTTP concerns
  lib/              -> infra: prisma client, jwt, crypto, rateLimit, logger, otp/
  middleware/       -> requireAuth (Bearer guard), withErrorHandler wrapper
  types/            -> ProcessEnv typing
```

Cross-cutting rules:

- **Response envelopes**: success `{ success: true, data }`, error `{ success: false, error: { code, message } }`
- **`withErrorHandler`** wraps every route: catches `ApiError` (mapped to status), Zod failures (400 VALIDATION_ERROR), unknown errors (500, logged with stack). Also logs every request (method, path, status, duration).
- **Ownership isolation**: every property/digipin/QR lookup scopes by the token's `userId`; foreign or missing rows → 404 (no existence leak).

## 4. Auth & OTP (module: auth)

- `POST /api/auth/send-otp` — 6-digit OTP via `crypto.randomInt(100000, 1000000)`, hashed (SHA-256 + OTP_HASH_SALT) before storage, 5-minute expiry. Rate limit: **3 sends / mobile / 10 min** (in-memory, swappable via `RateLimiter`).
- `POST /api/auth/verify-otp` — max 3 attempts (incremented on failure), constant-time hash compare, previous unconsumed OTPs invalidated on resend. Creates the user on first login. Opens a `Session`, issues access + refresh tokens.
- `POST /api/auth/refresh` — **rotation**: presented token is revoked, a new pair is issued. Reuse of a revoked token revokes the **entire session family** (all refresh tokens of the session + the session row), with a generic `INVALID_REFRESH_TOKEN` 401 (no reuse/expiry/invalid leak).
- `POST /api/auth/logout` — **requires `{ "refreshToken": ... }` in the body** (validated with `refreshTokenSchema`); revokes the token + deletes its session row (204).
- `GET /api/auth/me` — current user profile.
- Note: access tokens are **stateless JWTs** — they remain valid for their 15-min TTL even after logout/family revocation (refresh dies instantly). Clients treat 401 as "needs re-auth".

**OtpProvider interface** (`src/lib/otp/index.ts`): `sendOtp(mobile, code)`. Registered providers map (`console` + `yourbulksms` implemented; future SMS providers register without touching auth logic). `src/lib/otp/console.otp.provider.ts` logs the code to stdout in dev.

**YourBulkSMS provider (2026-08-09)** — `src/lib/otp/yourbulksms.otp.provider.ts`: HTTP GET to `http://control.yourbulksms.com/api/sendhttp.php` with `authkey`, `mobiles=91<mobile>`, `message` (from `YOURBULKSMS_OTP_TEMPLATE` with `{code}` substituted), `sender`, `route=2`, `country=0`, `DLT_TE_ID`. Success = numeric message id in the response body; non-numeric body (e.g. `{"Status":"Failed","Code":"012",...}`) → logged + thrown (surfaces as 500 INTERNAL_SERVER_ERROR via the route handler). `OTP_PROVIDER="yourbulksms"` in `.env`; console stays the dev fallback.

**Dev OTP bypass (2026-08-09)** — `OTP_BYPASS_ENABLED=true` + `OTP_BYPASS_MOBILE` + `OTP_BYPASS_CODE` (default `123456`): the bypass mobile receives **no SMS** and its fixed code always verifies (rate limits, hashing and the OTP record flow are untouched). Server log prints the real generated code via `[OtpBypass]`. Disable before production.

## 5. Users (module: users)

- `GET /api/users/me`, `PATCH /api/users/me` (name, email, profileImage, language, accountStatus ACTIVE/DEACTIVATED), `DELETE /api/users/me` (soft-delete → status DELETED + revoke all sessions/tokens).
- All operations act on the token's own `userId` only.

## 6. Properties & registration flow (module: properties)

- `POST /api/properties` — creates a DRAFT (steps 1–3 required).
- `PATCH /api/properties/:id` — progressive step fill (address, city/state/pincode, lat/lng). Zod per field (6-digit pincode, lat −90…90, lng −180…180). **PATCH can never change verificationStatus.**
- `GET /api/properties`, `GET /api/properties/:id` — own records only.
- `POST /api/properties/:id/submit` — full completeness gate (400 PROPERTY_INCOMPLETE otherwise), status transition enforced server-side via `ALLOWED_TRANSITIONS` map (DRAFT→SUBMITTED only). Inside a transaction: update property → generate DigiPin (retry-on-P2002) → create QR → return digipinNumber.

## 7. DigiPin generation (module: digipin)

- Format: `[2-letter state code][4-digit crypto-random][last 2 pincode digits]` → e.g. `WB472801`.
- State table: all 28 states + 8 UTs with aliases (`src/modules/digipin/stateCodes.ts`); unknown state → 400.
- `crypto.randomInt(1000, 10000)` for the 4-digit part.
- **Uniqueness via DB constraint, not pre-check**: `generateDigiPin(state, pincode, { persist, maxRetries })` catches Prisma P2002 and retries (default 5); exhaustion → `DIGIPIN_GENERATION_FAILED`. Caller injects `persist` (a `prisma.digiPin.create` closure), which also makes it unit-testable without a DB.
- Server-side only — no client path can construct a DigiPin.

## 8. QR (module: qr, stub-level)

- `GET /api/digipins/:id/qr` — create/retrieve a QR whose payload is an **opaque token** (`https://digipin.app/q/<32 hex>`), never personal data.
- `POST /api/qr/verify` — resolves the token server-side, returns only authorized info: digipinNumber, status, verificationStatus, city, state.

## 9. Location (module: location — hybrid GPS + geocoding, live)

- `Geocoder` interface (`geocode(address)` + `reverseGeocode(lat, lng)`) with two implementations behind `LOCATION_PROVIDER`:
  - **`osm`** (default) — OpenStreetMap **Nominatim**, free + keyless, `User-Agent` set, 8 s timeout.
  - **`mock`** — fixed New Delhi coords for offline dev/tests.
- **Resilience (2026-08-09)**: all geocoder calls are serialized and spaced ≥1.2 s apart (Nominatim's ~1 req/s policy — rapid verify+submit previously produced HTTP 429 which surfaced as 502). 429/5xx are retried with backoff (3 attempts). A single-query miss falls back down a ladder: full address → minus pincode → minus house number → locality+city.
- `POST /api/location/verify` — **hybrid flow** (users never type coordinates):
  - `address` (required) is always geocoded server-side → `latitude`/`longitude`/`formattedAddress`/`source` (coords rounded to 6 decimals).
  - Optional device GPS (`latitude`/`longitude`, rounded to 6 dp) is cross-checked against the geocoded point (haversine): `verified: true` when within `VERIFY_TOLERANCE_METERS = 500` → `matchBasis: "gps"`.
  - **Locality fallback**: if farther than 500 m, the server reverse-geocodes the GPS point and compares city+state with the typed address (`sameLocality`, e.g. OSM display names "Naini, Karchhana, Prayagraj, Uttar Pradesh, 211108, India") — match → `verified: true`, `matchBasis: "locality"` (absorbs coarse OSM pins that can land km away).
  - Unresolvable address → **502 GEOCODE_FAILED** (never a 500).
- `POST /api/location/reverse` (2026-08-09) — public; turns GPS coordinates into a place name for client auto-fill (`{ formattedAddress, source }`; 502 GEOCODE_FAILED when unresolvable).
- Property submit: `latitude`/`longitude` are now **optional** — server geocodes `address + city + state + pincode` when the client sends no GPS (submit returns 502 GEOCODE_FAILED if even that fails).
- Google Maps can drop in later behind the same `Geocoder` interface (`LOCATION_PROVIDER=google`) — no route changes.

## 10. Media (module: media, implemented Phase 1)

- `StorageProvider` interface: `uploadFile`, `getSignedUrl`, `deleteFile`.
- `LocalStorageProvider` writes to `STORAGE_LOCAL_DIR` (default `./public/uploads` so Next serves `/uploads/...`), path-traversal sanitized.
- Shared multipart pipeline (`parseUploadedImage`): busboy with a **stream-level 5 MB cap** (oversized files never buffer fully), **magic-byte sniffing** (JPEG/PNG/WebP/HEIC — client MIME/extension never trusted), ownership-tracked via `MediaFile` (id, userId, purpose, storageKey, url, mimeType, sizeBytes, createdAt).

**Dedicated upload endpoints (2026-08-09, replaced the generic `POST /api/media/upload`):**

| Endpoint | Purpose | Behavior |
|---|---|---|
| `POST /api/media/selfie` | SELFIE | **Single slot** — uploading replaces the previous selfie; the user always has exactly one current selfie, so a property can never silently lose its selfie |
| `POST /api/media/property-images` | PROPERTY_IMAGE | **Pool capped at 3** — a 4th upload automatically evicts the oldest; submit takes the surviving ids |
| `POST /api/media/profile-image` | PROFILE_IMAGE | **Single slot** — replaces the previous profile image; the fileId goes to `PATCH /api/users/me` `profileImage` |

- `DELETE /api/media/:fileId` — owner-only; identical 404 for foreign/missing files. Deleting the current selfie/property image is allowed but submit then rejects (media must exist + match purpose at submit).
- `POST /api/properties/:id/submit` requires `propertyImages` (≥1, PROPERTY_IMAGE, no max — pool enforces 3) + `selfieImage` (SELFIE) — ownership/purpose checked before the transaction. The property↔media mapping is validated but not yet persisted on the Property row (Phase 2).

## 11. Testing (src/tests, Vitest)

| File | Covers |
|---|---|
| digipin.test.ts | format regex, alias state names, **1000 generations with zero collisions**, retry-on-P2002 (deterministic), retry exhaustion, unknown state |
| otp.test.ts | 6-digit randomness, hashing (no plaintext), constant-time compare, expiry + attempt-limit logic |
| jwt.test.ts | access/refresh round-trip, tamper/expiry rejection, 15-min TTL, token hashing |

17/17 pass. `npm run lint` clean, `tsc --noEmit` clean.

## 12. Live verification (local MySQL)

End-to-end smoke test against `http://localhost:3000` (see sections 16–18 for the
full Phase 1 finish/secure/document passes):

1. `POST /api/auth/send-otp` → OTP logged by console provider
2. `POST /api/auth/verify-otp` → user created, tokens issued
3. `GET /api/users/me` → `mobile=9876543210, status=ACTIVE`
4. `POST /api/properties` → DRAFT
5. `PATCH /api/properties/:id` (address/city/state/pincode/lat/lng)
6. Incomplete submit → **400 PROPERTY_INCOMPLETE**
7. Full submit → `verificationStatus=SUBMITTED`, **DigiPin `WB637701`**
8. `GET /api/digipins/:id/qr` → `https://digipin.app/q/<token>`
9. `POST /api/qr/verify` `{ "token": "<hex, without prefix>" }` → digipinNumber/status/city/state only
10. Refresh rotation → new pair; old token reuse → **401 INVALID_REFRESH_TOKEN** (whole family dead)
11. Logout → 204; refresh with logged-out token → 401

Test data was deleted after verification (all tables clean).

## 13. TODOs / stubs for later phases

1. Real OTP/SMS go-live — **YourBulkSMS provider implemented** (authkey + DLT sender `URBLKM` / template `4567123`); **blocked on the client enabling API access** (Code 012). See TODO.md §11 — Phase 1 gate before Phase 2.
2. S3/GCS storage provider behind `StorageProvider` (`STORAGE_*`)
3. Real Google Maps geocoding behind `Geocoder` (`GOOGLE_MAPS_API_KEY`)
4. Redis-backed rate limiter behind `RateLimiter` (`RATE_LIMIT_BACKEND`)
5. Persist the property↔media mapping on the Property row (submit currently validates ownership only)
6. Pino/structured log transport in `src/lib/logger.ts`
7. OTP/session cleanup jobs

## 14. Commands

```bash
npm install
cp .env.example .env          # fill DATABASE_URL + secrets
npx prisma migrate dev --name init
npm run dev                   # http://localhost:3000
npm run lint && npm run typecheck && npm test
npm run export:postman        # postman/ownmypin.postman_collection.json
```

## 15. Security pass — findings & fixes (2026-08-09)

Each bullet from the review prompt, what was wrong (if anything), and what changed.

1. **OTP_HASH_SALT env-only, fail startup loudly** — WAS BROKEN: `src/lib/crypto.ts`
   fell back to `JWT_ACCESS_SECRET` and then a hardcoded `"ownmypin-dev-salt"`.
   FIXED: env-only read with a ≥16-char check that throws; startup validation in
   `src/instrumentation.ts` (`assertSecureEnv` in `src/lib/env.ts`) refuses to boot
   on missing/short/placeholder secrets. Unit tests now set a real salt.

2. **Rate limiting** — WAS: keyed on mobile only (`otp:send:{purpose}:{mobile}`, 3/10 min).
   FIXED: kept per-mobile as primary; added a coarse IP second layer
   (`otp:send:ip:{ip}`, 15/10 min, `x-forwarded-for`/`x-real-ip` best effort) in
   `POST /api/auth/send-otp`. Mobile stays primary so shared/NAT IPs are not bricked.

3. **JWT secrets** — WAS: read from env with runtime length check (no fallbacks), but
   startup was not validated and there was no distinctness check. FIXED: startup
   `assertSecureEnv` requires `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` ≥32 chars,
   different from each other, and not the `change-me` placeholders. No code fallbacks.

4. **Token reuse → session family revocation** — WAS BROKEN: reuse path called
   `revokeSession(sessionId)` which ran `refreshToken.updateMany({ where: { id: sessionId } })`
   — refresh-token ids are `jti`s, so it matched nothing (family NOT revoked), and it
   leaked `TOKEN_REUSE_DETECTED`. FIXED: `RefreshToken.sessionId` column + index added
   (migration `20260809072933`); reuse now revokes **every** token in the session via
   `updateMany({ where: { sessionId } })` + deletes the session row (cascade), and all
   refresh failures return the same generic `INVALID_REFRESH_TOKEN` 401 (no reuse vs
   expiry vs invalid leak).

5. **CORS** — WAS: nothing (no CORS handling at all). FIXED: `src/middleware.ts` enforces
   an env-configured allowlist (`CORS_ALLOWED_ORIGINS`, comma-separated; dev default
   `http://localhost:3000`). Browser origins not on the list get 403 `CORS_DENIED`;
   non-browser clients (Flutter) without an Origin header are unaffected. Never `*`.

6. **Logger body leakage** — VERIFIED CLEAN: `withErrorHandler` logs only method/path/
   status/duration — no request bodies anywhere, including `/api/auth/*` and media
   routes. The console OTP provider logs the OTP code by design (dev-only, documented).

7. **Zod `.strict()` everywhere** — WAS: `sendOtpSchema`, `verifyOtpSchema`,
   `refreshTokenSchema`, inline QR/location schemas, and the submit gate were NOT strict.
   FIXED: all are `.strict()` now (media `purpose` included); unknown keys → 400.

8. **File upload security** — re-verified: `LocalStorageProvider.sanitizeKey` strips
   `..` and leading slashes; filenames are server-generated opaque ids (original names
   never used in paths). ADDED: magic-byte sniffing (`sniffImageMime`) — JPEG/PNG/WebP/
   HEIC detected from bytes, client MIME/extension ignored; multipart-level cap via
   busboy `limits.fileSize` (5 MB) so oversized files are never fully buffered.

9. **SQL injection surface** — grep for `$queryRawUnsafe`/`executeRawUnsafe`: **none** in
   the codebase; all access is Prisma's typed client.

10. **Error responses / existence leaks** — VERIFIED CLEAN: property/digipin/QR/media
    lookups all return the same 404 for foreign vs missing ids (E2E cross-user test in
    section 16). Also fixed during E2E: missing `purpose` on media upload returned 500
    (raw ZodError) instead of 400 — now `validateBody` maps it correctly.

11. **Dependency audit** — `npm audit`: 8 vulnerabilities remain, ALL transitive, none
    runtime-reachable from the API surface: `postcss`/`sharp` (high, via `next` —
    build-time; fix = next@16 breaking upgrade), `js-yaml`/`yaml`/`uuid` (via
    `openapi-to-postmanv2`, dev-only Postman export tool). `swagger-ui-react` (removed —
    unused; swagger-ui-dist is served directly) previously added one vulnerable
    `js-yaml` path. No force-upgrades applied (breaking changes); revisit with the
    next framework upgrade.

## 16. Functional pass — results (2026-08-09)

Full E2E walkthrough against `http://localhost:3000` (dev server, console OTP provider,
local MySQL). All green; two bugs found & fixed mid-pass (marked ✓-fix).

| # | Step | Result |
|---|------|--------|
| 1 | `send-otp` → OTP captured from console provider log | ✅ 200 |
| 2 | `verify-otp` → user created, access + refresh tokens | ✅ 200 |
| 3 | Upload PROFILE_IMAGE (multipart) → fileId + url; url serves 200 | ✅ 201 |
| 4 | `PATCH /api/users/me` with profileImage fileId → resolved URL stored | ✅ 200 |
| 5 | Foreign/wrong-purpose fileId attach → 400 INVALID_MEDIA_FILE | ✅ |
| 6 | Create property (DRAFT) + PATCH all steps | ✅ 201 / 200 |
| 7 | Upload 2× PROPERTY_IMAGE + SELFIE | ✅ 201 ×3 |
| 8 | Submit without images → 400 PROPERTY_INCOMPLETE; without selfie → 400; empty propertyImages → 400 | ✅ |
| 9 | Full submit → DigiPin **WB629801**, status SUBMITTED | ✅ 200 (✓-fix: media fields were leaking into `prisma.property.update` → 500) |
| 10 | `GET /api/digipins/:id/qr` → opaque token, ACTIVE | ✅ 200 |
| 11 | `POST /api/qr/verify` (public) → digipinNumber/status/city/state only | ✅ 200 |
| 12 | Bad QR token → 404 QR_NOT_FOUND | ✅ |
| 13 | `POST /api/location/verify` (mock echo) | ✅ 200 |
| 14 | Refresh rotation → new pair (200); old token reuse → generic 401; **the new token also 401 — whole family revoked** | ✅ |
| 15 | Delete media file → 204; gone from disk AND `media_files`; re-delete → 404 | ✅ |
| 16 | Logout → 204; refresh with logged-out token → 401 | ✅ |
| 17 | Cross-user: B GETs A's property → 404 identical to nonexistent; digipin QR → 404 | ✅ |
| 18 | CORS: evil Origin → 403 CORS_DENIED; allowed origin gets ACAO header | ✅ |
| 19 | Zod strict: unknown field → 400 VALIDATION_ERROR | ✅ |
| 20 | Magic bytes: `.png` name with text content → 400 INVALID_FILE_TYPE; 6 MB file → 413 at stream level | ✅ |
| 21 | Upload missing `purpose` → 400 (✓-fix: was 500 from raw ZodError) | ✅ |

Checks: `tsc --noEmit` clean, `npm run lint` clean, `npm test` 17/17.
Test data deleted afterwards — all tables clean (users/properties/digipins/qrs/media/sessions/tokens/otps = 0).

> Note: steps 3–9 above used the pre-redesign generic `POST /api/media/upload`.
> The definitive post-redesign pass (dedicated media endpoints) is section 17.

## 17. Full-sequence pass — post media redesign (2026-08-09, definitive)

One clean walkthrough, every endpoint in proper order, fresh user via real OTP.
Result: **30/30 PASS** (post hybrid-location update; steps 18–20 cover the
geocoder). Test users deleted after (DB+disk); only the developer's
account (8090780908) remains.

| # | Step | Result |
|---|------|--------|
| 1 | Unauth `GET /api/users/me` (gate check) | ✅ 401 UNAUTHORIZED |
| 2 | `send-otp` → OTP captured from console provider log | ✅ 200 |
| 3 | `verify-otp` → access + refresh tokens | ✅ 200 |
| 4 | `GET /api/auth/me` | ✅ 200 |
| 5 | `GET /api/users/me` | ✅ 200 |
| 6 | `POST /api/media/profile-image` (multipart) | ✅ 201 |
| 7 | `PATCH /api/users/me` `{ name, profileImage }` | ✅ 200 |
| 8 | `POST /api/media/property-images` ×2 | ✅ 201 ×2 |
| 9 | `POST /api/media/selfie` | ✅ 201 |
| 10 | `POST /api/properties` → DRAFT | ✅ 201 |
| 11 | `PATCH /api/properties/:id` (details) | ✅ 200 |
| 12 | `GET /api/properties` (list) | ✅ 200 |
| 13 | Submit with NO media → 400 PROPERTY_INCOMPLETE | ✅ |
| 14 | Full submit → DigiPin (`UP...`), SUBMITTED | ✅ 200 |
| 15 | `GET /api/digipins/:id/qr` → opaque token URL | ✅ 200 |
| 16 | `POST /api/qr/verify` `{ token }` (public) | ✅ 200 |
| 17 | `qr/verify` with bad token | ✅ 404 QR_NOT_FOUND |
| 18 | `POST /api/location/verify` — address only → geocoded (real OSM coords, `source: osm`) | ✅ 200 |
| 19 | `location/verify` with device GPS at the address → `verified: true`, distance ~0 m | ✅ 200 |
| 20 | `location/verify` unresolvable address → 502 GEOCODE_FAILED | ✅ |
| 21 | Refresh rotation → new pair | ✅ 200 |
| 22 | Logout `{ refreshToken }` → 204 | ✅ |
| 23 | `users/me` after logout → **200** (stateless access JWT, by design) | ✅ |
| 24 | Refresh with logged-out token | ✅ 401 |
| 25 | Reused original refresh token → family revocation | ✅ 401 INVALID_REFRESH_TOKEN |
| 26 | `DELETE /api/media/:id` | ✅ 204 |
| 27 | Re-DELETE same id | ✅ 404 |
| 28 | Evil `Origin` header | ✅ 403 CORS_DENIED |
| 29 | Zod strict: unknown field in PATCH | ✅ 400 VALIDATION_ERROR |
| 30 | Magic bytes / 5 MB cap / pool eviction (separate pipeline test) | ✅ 400 INVALID_FILE_TYPE, 413, 3-cap |

**API behaviors confirmed by this pass** (client-relevant):
- `logout` requires `{ "refreshToken" }` in the body — not `{}`.
- `qr/verify` takes the bare hex `token` — NOT the full `https://digipin.app/q/...` URL.
- `location/verify` requires `address` (≥5 chars); `latitude`/`longitude` are **optional** device GPS.
- Submit accepts **no lat/lng** — the server geocodes the address automatically (verified live: "14 Park Street, Ballygunge, Kolkata 700016" → 22.5359, 88.3587 stored in DB).
- Access tokens survive logout until their 15-min TTL (stateless); refresh tokens die instantly.
- No `GET /api/digipins` list endpoint in Phase 1 — the digipin id comes from the
  submit response/DB; clients must persist it after submit.

## 18. Swagger / docs deliverable

- `GET /api/docs` — Swagger UI at `http://localhost:3000/api/docs` (assets served locally from swagger-ui-dist, `persistAuthorization` on).
- `GET /api/openapi.json` — generated spec (**16 paths**, 7 tags, Bearer http security scheme, shared Success/Error envelopes + UserProfile schema, real Zod constraints in request schemas).
- `npm run export:postman` → `postman/ownmypin.postman_collection.json` (folder-per-tag, pre-wired Authorization header via `bearerToken` variable).
- Single source of truth: `scripts/openapi.definition.cjs` + per-route `@swagger` JSDoc.

## 19. Phase 1 status — DONE (2026-08-09)

**Delivered & verified:**
- Database: MySQL + Prisma, 3 migrations (init, sessions-family `20260809072933`), 9 models; test data cleaned, dev DB has only the developer account.
- Auth: OTP (hashed, 3 attempts, 5-min TTL, rate-limited mobile+IP), JWT access 15 min / rotating refresh 7 days, session-family revocation on reuse, logout.
- Media: dedicated endpoints (profile-image / selfie / property-images pool-3) + shared multipart pipeline (magic bytes, 5 MB stream cap) + owner-only delete.
- Location: hybrid GPS + geocoding live (Nominatim via `LOCATION_PROVIDER=osm`; submit no longer requires manual lat/lng; 502 GEOCODE_FAILED on unresolvable addresses).
- Properties → DigiPin → QR flow with submit gate; state-code table (28 states + 8 UTs); DigiPin `WB629801`/`UP499807`/`UP725207` generated live.
- Swagger UI (`/api/docs`, 16 paths) + OpenAPI spec + Postman export.
- Security pass (doc §15), functional pass pre-redesign (§16) and definitive post-redesign (§17, **30/30**).
- `tsc`/`lint` clean, `npm test` 23/23 (incl. new `location.test.ts`).

**Open / Phase 2 candidates (not defects, by design):**
1. Real OTP/SMS provider (console logs the code in dev) — **user asked to discuss OTP implementation next**.
2. Persist property↔media mapping on the Property row (submit validates ownership only).
3. `GET /api/digipins` list / digipin id in submit response for the client.
4. Google Maps geocoder behind the same `Geocoder` interface (`LOCATION_PROVIDER=google`, `GOOGLE_MAPS_API_KEY`) — Nominatim already live.
5. Redis rate limiter, S3/GCS storage, structured logging (pino), OTP/session cleanup jobs.
6. Postgres vs MySQL: SOW PDF says PostgreSQL, prompt says MySQL — **still flagged for client decision**. Current code is Prisma-agnostic except `provider = "mysql"` in schema.prisma.
