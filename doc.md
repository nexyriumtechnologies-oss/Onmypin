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

**YourBulkSMS provider (2026-08-09, live-verified 2026-08-11)** — `src/lib/otp/yourbulksms.otp.provider.ts`: HTTP GET to `http://control.yourbulksms.com/api/sendhttp.php` with `authkey`, `mobiles=91<mobile>`, `message` (from `YOURBULKSMS_OTP_TEMPLATE` with `{code}` substituted), `sender`, `route=2`, `country=0`, `DLT_TE_ID`. Success = a plain numeric message id **or** the JSON envelope `{"Status":"Success","Code":"000","Message-Id":...}` (both accepted since 2026-08-11); anything else → logged + thrown (surfaces as 500 INTERNAL_SERVER_ERROR via the route handler). `OTP_PROVIDER="yourbulksms"` in `.env`; console stays the dev fallback.
- **Live results:** API now accepts sends (`Code: 000`) and SMS arrives on the phone once the message matches the registered DLT template exactly. Template IDs that didn't work: `4567123` ("template not found"). Working: `1707163456288183577` (title "testing", data `Your OwnMyPin OTP is {#var#}`).
- ⚠️ **Open issue:** the OTP template ends at `{#var#}` (variable = last char) → operator returns "Template not Matched" (DLT 633/5307) for OTP sends. Register a template with fixed text after the variable (e.g. `Your OwnMyPin OTP is {#var#}. Valid for 5 minutes. Do not share it.`) to unblock real OTP delivery.

**Dev OTP bypass (2026-08-09 → REMOVED 2026-08-11)** — the `OTP_BYPASS_ENABLED`/`OTP_BYPASS_MOBILE`/`OTP_BYPASS_CODE` block in `src/modules/auth/otp.service.ts` is now **commented out**; real SMS (YourBulkSMS) is the only path. `.env` has `OTP_BYPASS_ENABLED=false`; `render.yaml` no longer uses the bypass.

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

1. Real OTP/SMS go-live — **YourBulkSMS provider implemented**; API access now **enabled** by the client (2026-08-11), delivery verified live. Remaining blocker: DLT template placeholder (see §4 — template must have fixed text after the variable). See TODO.md §13.
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
1. Real OTP/SMS go-live — provider implemented (YourBulkSMS), **awaiting the client to enable API access** (Code 012) — Phase 1 gate per TODO.md §11.
2. Persist property↔media mapping on the Property row (submit validates ownership only).
3. `GET /api/digipins` list endpoint (digipin id now returned in the submit response — `digipinId`).
4. Google Maps geocoder behind the same `Geocoder` interface (`LOCATION_PROVIDER=google`, `GOOGLE_MAPS_API_KEY`) — Nominatim already live.
5. Redis rate limiter, S3/GCS storage, structured logging (pino), OTP/session cleanup jobs.
6. Postgres vs MySQL: SOW PDF says PostgreSQL, prompt says MySQL — **still flagged for client decision**. Current code is Prisma-agnostic except `provider = "mysql"` in schema.prisma.

## 20. Phase 1.1 — OTP provider + location robustness + API test lab (2026-08-09)

Follow-up pass after Phase 1 sign-off. **No code regressions** — `tsc`/`lint` clean, `npm test` 23/23 (kept at 23; location tests cover the new logic paths).

### 20.1 YourBulkSMS OTP provider
- `src/lib/otp/yourbulksms.otp.provider.ts` (see §4) — real SMS delivery via `sendhttp.php`, DLT-compliant (`sender` + `DLT_TE_ID` + approved template).
- Wired via the existing `OtpProvider` registry — zero auth-flow changes.
- **Live test result (2026-08-09)**: the provider works end-to-end (request reaches the API and the JSON error is parsed correctly) but the account rejects auth: `{"Status":"Failed","Code":"012","Description":"You have not authorised to access API."}` — the client must enable API access / verify the authkey in the YourBulkSMS panel.
- **Update (2026-08-11)**: API access enabled → live sends accepted (`Code: 000`); fixed the success check to accept the JSON envelope; SMS arrives when the message matches the DLT template. Template `4567123` → "template not found"; current template `1707163456288183577` ends at `{#var#}` → "Template not Matched" — fix in TODO.md §13.

### 20.2 Dev OTP bypass
- `OTP_BYPASS_ENABLED/MOBILE/CODE` — bypass mobile receives no SMS; its fixed code always verifies. Verified live: send-otp 200 → verify-otp 200 → tokens issued (user `8090780908`).
- Purpose: unblock client/frontend work while the SMS API access is pending; `OTP_BYPASS_ENABLED=false` for production.

### 20.3 Location robustness (user-reported 502s)
- Root cause: Nominatim rate limiting (429) under rapid verify+submit, plus zero-match queries for house-level addresses.
- Fixes: ≥1.2 s serialized request spacing, 429/5xx retry with backoff, fallback query ladder, locality-level GPS verification (`matchBasis: "locality"`), 6-dp coordinate rounding, `POST /api/location/reverse`.
- Verified live with the user's exact scenario (GPS at Naini, Prayagraj; address pin 6.7 km away): `verified: true, matchBasis: "locality"`.
- **New/changed API surface**: `POST /api/location/reverse`; `location/verify` response gains `matchBasis`; submit response gains `digipinId` (needed by `GET /api/digipins/:id/qr`). All documented in API_REFERENCE.md.

### 20.4 API test lab
- `public/api-test.html` — same-origin dev harness exercising every endpoint (bypass login, profile, media uploads, location verify with Leaflet map + GPS auto-fill via reverse-geocode, property draft→submit→DigiPin+QR, QR verify). Not part of the app; harmless dev tool.

## 21. Phase 2 — Milestone 2: Core Features & Admin Panel (plan, 2026-08-11)

Per the signed SOW Milestone 2 scope. **Workflow (user directive):** one module at a time → implement → unit tests → E2E → update `API_REFERENCE.md` + `doc.md` → mark done in TODO.md → compact chat → next module. Module order in TODO.md §12.

### 21.1 Schema foundation (one migration — `12.0.1`)
- New models: `SearchHistory`, `Business`, `BusinessImage`, `BusinessCategory`, `SubscriptionPlan`, `Subscription`, `Transaction`, `Notification`, `AdminUser`.
- `User` gains `trustScore Int @default(0)` + `trustScoreUpdatedAt DateTime?`.
- `MediaPurpose` += `BUSINESS_IMAGE`, `BUSINESS_LOGO`.
- New enums: `BusinessVerificationStatus` (PENDING/UNDER_REVIEW/VERIFIED/REJECTED/SUSPENDED), `BusinessStatus` (ACTIVE/INACTIVE), `NotificationType`, `SubscriptionTier` (FREE/BASIC/PREMIUM), `SubscriptionStatus` (ACTIVE/EXPIRED/CANCELLED), `TransactionType` (SUBSCRIPTION/OTHER), `TransactionStatus` (PENDING/SUCCESS/FAILED/REFUNDED), `AdminRole` (SUPER_ADMIN/ADMIN/VERIFICATION_ADMIN/CONTENT_ADMIN/FINANCE_ADMIN).
- Phase 1 tables remain untouched; new tables follow the same conventions (cuid PKs, createdAt/updatedAt, `@@unique`/`@@index`, cascade like User/Property).

### 21.2 New env vars (`12.0.2`)
- `ADMIN_JWT_SECRET` (required ≥32, distinct — added to `assertSecureEnv`), `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` (one-time SUPER_ADMIN seed), `PAYMENT_PROVIDER` (default `mock`), `PUSH_PROVIDER` (default `console`), `MOCK_PAYMENT_WEBHOOK_SECRET`. Razorpay/FCM keys documented as commented placeholders (live wiring later).

### 21.3 Module 1 — Location & Search APIs (DONE — see §22)
- `GET /api/locations/nearby`, `GET /api/search`, `GET /api/search/nearby`, `GET /api/search/history`, `POST /api/search/history`.
- Search uses stored coordinates (haversine) — **no geocoder call at query time** (Nominatim rate-limit safety).
- Privacy-safe results: DigiPin number + city/state only for properties; **never** full address, owner name, or media.
- Businesses in public search are restricted to VERIFIED + ACTIVE.

## 22. Phase 2 Module 1 — Search & Location (done, 2026-08-11)

Implemented, unit-tested (9 search tests + 8 authorization-audit tests, 40/40 total), lint + typecheck clean, and functionally verified against the live dev server.

### 22.1 Files
- `src/modules/search/search.validation.ts` — Zod schemas + shared defaults (`DEFAULT_PAGE_SIZE=20`, `MAX_PAGE_SIZE=100`, `DEFAULT_RADIUS_KM=5`, `MAX_RADIUS_KM=100`).
- `src/modules/search/search.service.ts` — `searchAll`, `searchNearby`, `propertyWhere`/`businessWhere`, `recordSearch`/`listSearchHistory`, public projections.
- `src/lib/queryParams.ts` — `parseQueryParams`: URL query string → Zod `.strict()` validation (same 400 `VALIDATION_ERROR` shape as bodies).
- Routes: `src/app/api/search/route.ts`, `src/app/api/search/nearby/route.ts`, `src/app/api/search/history/route.ts`, `src/app/api/locations/nearby/route.ts`.
- `src/tests/search.test.ts` — privacy projections (no PII leak), where-clause builders, DigiPin-required gating.
- `src/tests/authorization.test.ts` — **authorization audit suite** (user-addendum): PUBLIC routes never 401; USER routes 401 on missing/garbage token, 200/201 with a valid signed user JWT (prisma mocked); plus fs-based hard-boundary guards — no `/api/admin/*` routes yet, no non-admin verification-approval route, no trust-score/badges routes, no payments webhook until their modules add them WITH their own auth tests.
- `src/middleware/errorHandler.ts` — `validateBody` re-typed to `z.output<S>` (fixes optional-field leakage from `.default()` schemas).

### 22.2 Behavior notes
- **Pagination:** `{ items, total, page, pageSize }`, default 20 / max 100. `searchAll` fills the page from properties first, then businesses; `total` = property + business counts.
- **Nearby:** fetches candidate rows using stored coords only, computes `distanceMeters` in-app (reuses `distanceMeters` from the location module), filters to radius, sorts by distance, then paginates. No geocoder at query time.
- **Privacy:** `projectPropertySearch` returns `null` for rows without a DigiPin; the property projection carries only `digipinId`/`digipinNumber`/`city`/`state`/`verificationStatus`/`latitude`/`longitude`. Business public projection: name/category/city/state + status + coords (contact info is Module 2's detail view, verification-gated).
- **History:** `POST` records a term (prunes to the last 50 per user); `GET` lists newest-first, paginated.
- **Bug found in E2E:** Prisma rejects `{ digiPin: { isNot: null, digipinNumber: { contains } } }` (can't mix relation filter with field filter) — nested `{ digiPin: { digipinNumber: { contains } } }` already implies existence. Fixed in `propertyWhere`.
- **Verified live:** `GET /api/search?q=UP` → 3 results; `?type=digipin` WB → WB105516/WB855216; nearby at 25.31,82.97 → both Varanasi properties at distance 0; validation 400s (missing `q`, `pageSize>100`); history requires Bearer (401 without), record→201, list→200.
- **Swagger:** all four routes annotated; tags Search + Location in `openapi.json` (version 0.2.0).
- **Auth audit (user addendum, 2026-08-11):** `GET /api/search|nearby` PUBLIC, `GET|POST /api/search/history` USER — enforced and asserted in `authorization.test.ts`; ADMIN boundary deferred to Module 7 (no `/api/admin/*` routes exist yet — enforced by a fs-based guard).

## 23. Phase 2 Module 2 — Business (done, 2026-08-11)

Implemented, unit-tested (19 business tests + authorization suite extended, **59/59 across 7 files**), lint + typecheck clean, and functionally verified E2E against the live dev server on :3001.

### 23.1 Files
- `src/modules/business/business.validation.ts` — `createBusinessSchema`, `patchBusinessSchema` (deliberately **omits** `verificationStatus`/`ownerUserId` → strict Zod rejects them), `businessesListQuerySchema` (`mine`, `q`, `categoryId`, `city`, `state`, `lat/lng/radiusKm`, pagination).
- `src/modules/business/business.service.ts` — core: `createBusiness`, `updateBusiness`, `getOwnedBusiness`, `getBusinessDetail`, `listMine`, `listPublicBusinesses` (radius via stored-coords haversine, `distanceMeters`), `requestVerification`, `attachBusinessImage` (cap 5), `setBusinessLogo` (single-slot), `removeBusinessImage`, `listActiveCategories`, projections (`projectBusinessDetail` includes contact — verification authorizes it public; `projectBusinessList` is contact/address/image-**free**).
- `src/middleware/auth.ts` — added **`optionalAuth`**: returns `userId | null`, never throws; garbage/expired token degrades to anonymous so PUBLIC routes can't 401 on a stale token (used by `GET /api/businesses/:id`).
- `src/modules/media/media.service.ts` — added `deleteMediaFileIfOwned(userId, fileId)` (silently ignores foreign/missing; used for logo-slot replacement).
- Routes: `src/app/api/businesses/route.ts`, `src/app/api/businesses/[id]/route.ts`, `src/app/api/businesses/[id]/verification-request/route.ts`, `src/app/api/categories/route.ts`, `src/app/api/media/business-images/route.ts`, `src/app/api/media/business-logo/route.ts`, `src/app/api/media/business-images/[businessImageId]/route.ts` — all `@swagger`-annotated.
- `scripts/seed-business-categories.mjs` + `npm run seed:categories` (idempotent via `findFirst` — name is **not** unique; `--env-file=.env`). Seeded 33 rows: 6 top-level categories + subs.
- `src/tests/business.test.ts` — 19 tests: visibility/projection rules, where-public builder, category validation via mocked `$transaction`, public-safe 404s, PATCH lock (schema + service), verification gate + geocode trigger, category tree.

### 23.2 Behavior & auth classification
- **Visibility (hard rule):** public detail exposes contact **only** when VERIFIED + ACTIVE; directory/list cards never carry contact/address/images; owner always sees own business full-detail at any status; non-owner on non-verified or missing id → identical `404 BUSINESS_NOT_FOUND` (no existence leak).
- **Lifecycle:** create → `PENDING + ACTIVE`; `verification-request` (only from PENDING/REJECTED → `UNDER_REVIEW`, else `400 INVALID_STATUS_TRANSITION`) with a completeness gate (`name/categoryId/address/city/state/≥1 image/contact`, insufficient → `400 BUSINESS_INCOMPLETE` naming fields); coordinates **geocoded** at this step if missing (reuses location `geocodeAddress` — users never type coords). Admin approve/reject arrives in Module 7.
- **Image rules:** `POST business-images` pool capped at 5 (6th → `400 BUSINESS_IMAGE_LIMIT`); `POST business-logo` is a single slot (old owned file deleted); both magic-byte validated.
- **Auth audit (extended):** PUBLIC = `GET /api/categories`, `GET /api/businesses` (no `mine=true`), `GET /api/businesses/:id` (optionalAuth; stale token → anonymous, still 200 for VERIFIED); USER = `POST/PATCH /api/businesses`, `GET ?mine=true`, `POST verification-request`, the three business-media routes. **No USER route can set approval state** (schema + service). fs-guard whitelists `includes("/verification-request/")` (routes include `/route.ts` in paths).
- **Verified live E2E :3001:** create → 201 PENDING; image/logo uploads (201); verification request → UNDER_REVIEW (geocoded); public no-token → 404 (no leak); owner GET → 200; `mine=true` → full detail w/ logo+5 images; PATCH rename → 200; PATCH `verificationStatus` → `400 VALIDATION_ERROR`; no-token PATCH → 401; DELETE image → 204; **foreign-user** PATCH/GET → 404; 6th image → `400 BUSINESS_IMAGE_LIMIT`; bare business verification → `400 BUSINESS_INCOMPLETE`. After simulating admin approval via direct DB flip (VERIFIED+ACTIVE): public detail → 200 **with contact**, directory → contact-free card, `?q=ganga` + `/api/search/nearby` both surface it. Dev DB keeps sample **Ganga Cafe & Terrace** `cmsolam7u0004o08wvfdxp69m` (VERIFIED+ACTIVE).

## 24. Phase 2 Module 3 — Trust Score (done, 2026-08-11)

Implemented, unit-tested (**70/70 across 8 files**), lint + typecheck clean, and E2E-verified live.

### 24.1 Files
- `src/modules/trust-score/trust-score.constants.ts` — **the single rule table** (all numbers tunable here): `TRUST_SCORE_MAX=100`, `TRUST_SCORE_FLOOR=0`, positive factors `VERIFIED_PROPERTY +15 (max 3)`, `VERIFIED_BUSINESS +20 (max 2)`, `BUSINESS_IMAGES +5 (max 2)`, `SELFIE_UPLOADED +10`, `PROFILE_IMAGE +5`, `ACCOUNT_AGE` (band top 20) + `ACCOUNT_AGE_BANDS` (5/10/15/20 at 30/90/180/365 days); penalties `REJECTED_PROPERTY −10 (max 2)`, `REJECTED_BUSINESS −10 (max 2)`.
- `src/modules/trust-score/trust-score.service.ts` — `computeTrustScore` (pure, DB-free, unit-tested), `getTrustScore` (read-only view), `recalculateTrustScore` (persists score+updatedAt; called by Module 7 admin approve/reject; NOT a route).
- `src/app/api/users/me/trust-score/route.ts` — `@swagger`, GET only.
- `src/tests/trust-score.test.ts` — 11 tests.

### 24.2 Behavior & auth classification
- **Derivation:** verified properties/businesses are counted from their `verificationStatus`; selfie from a `SELFIE` media file; profile photo from `User.profileImage`; account age from `User.createdAt`; penalties apply per **currently-rejected** property/business (drops when resubmitted/verified). Caps per factor; total clamped to `[0, 100]`.
- **Read-only endpoint:** `GET /api/users/me/trust-score` derives live and NEVER writes (`updatedAt` = last admin recalc, `null` if never recalced). POST/PATCH → 405 (Next.js) and fs-guard in `authorization.test.ts` asserts the route file exports only `GET`. Score is NEVER client-settable; the only writer is `recalculateTrustScore` under Module 7.
- **Auth audit:** endpoint added to `authorization.test.ts` USER_ROUTES (401 missing/garbage, 200 with valid JWT); the "no trust-score/badges routes" guard became a **positive read-only guard** for trust-score + still asserts badges have no routes (Module 6).
- **Bug found in tests:** the DB mock returned the same value for the VERIFIED and REJECTED property counts → an invisible penalty leaked into assertions; fixed with per-`verificationStatus` mock implementations. Also `ApiError` carries `status` (not `statusCode`), and `ageInDays` is clock-sensitive — tests pinned the account-age band via an epoch `createdAt`.
- **Verified live:** 401 without token / with garbage token; 200 with valid token → `score: 40` (1 VERIFIED business +20, business photos +5, selfie +10, profile +5; 0 verified properties, 0 penalties; account-age 0 for a few-days-old dev user) — exactly mirrors the Module 2 DB state; `updatedAt: null` confirms the GET never persisted; POST/PATCH → 405. OpenAPI: tag `Trust Score` + path present, version **0.4.0**.

## 25. Phase 2 Module 4 — Notifications (done, 2026-08-11)

Implemented, unit-tested (26), lint + typecheck clean, and live-E2E-verified (20/20). Config: `PUSH_PROVIDER` (default `console`; unknown values fail fast).

### 25.1 Files
- `src/modules/notifications/notifications.service.ts` — internal `createNotification(userId, title, message, type)` (row only, validates type, 404 on missing user), `listNotifications` (paginated + `filter` + unread tally), `markNotificationRead` (owner-only, idempotent), `markAllNotificationsRead`, `registerDeviceToken` / `removeDeviceToken` (self-scoped upsert/delete), `detectInvalidDeviceTokens` (stubbed → `[]`) + `removeInvalidTokens` + `pruneInvalidDeviceTokens`, `sendDevicePush` (per-token, collects failures), **`notifyUser`** (create row FIRST, then best-effort push — DB is source of truth; used by Modules 5/7 to wire real events).
- `src/modules/notifications/push.provider.ts` — `PushProvider` interface (`send`), `ConsolePushProvider`, `getPushProvider()`.
- `src/modules/notifications/notifications.validation.ts` — strict schemas (list query, register body, delete query).
- Routes under `src/app/api/notifications/`: `route.ts` (GET), `read-all/route.ts` (POST), `[id]/read/route.ts` (PATCH), `device-token/route.ts` (POST/DELETE).
- `src/tests/notifications.test.ts` — 26 tests (helper 4, list 3, mark-read 3, read-all 2, device-token 3, send-push 3, invalid-token 3, notifyUser 2, providers 3).

### 25.2 Behavior & auth classification
- **Self-service only:** every notification route acts on the caller's OWN notifications/tokens. `PATCH /:id/read` returns the identical `404 NOTIFICATION_NOT_FOUND` for foreign or missing ids (no existence leak). There is NO user route that sends/broadcasts a notification to anyone — admin broadcast is Module 7 (guarded in the suite).
- **Push is fire-and-forget:** `notifyUser` persists the row first; a provider failure or missing device tokens never fails the event. `sendDevicePush` returns `{ sent, failed }` for observability. FCM will be a drop-in `PushProvider` plus real `detectInvalidDeviceTokens` (currently stub → `[]`).
- **Auth audit (authorization.test.ts):** all 5 notification entries added to USER_ROUTES (401 missing/garbage, DEVICE-token 400/deletion 404 etc. covered in unit tests); valid-token acceptance extended with `GET /api/notifications` → 200 and `POST /api/notifications/device-token` → 201. New guard: notification routes must stay out of `/admin/`, no `broadcast|send|notify` flavored path in the user tree, and `device-token` must only reference register/remove helpers.
- **Swagger gotcha fixed:** a multiline plain-YAML description on `GET /api/notifications` contained `(default: all)` → swagger-jsdoc dropped the whole path (semantic error, only that path missing while siblings parsed). Switched that description to a folded `>-` scalar — all 4 notification paths now emit.
- **Verified live:** login via OTP bypass; no-token/garbage-token → 401 (INVALID_ACCESS_TOKEN for garbage); device-token register 201 + upsert platform refresh, DELETE 204, re-DELETE 404, bad platform 400; seeded 2 rows via Prisma → list 200 (total 2, unread 2), `?filter=read|unread` narrows, bogus filter 400; PATCH read → 200 readStatus true (missing/foreign id → identical 404); read-all → updatedCount 1, unread → 0; POST on GET-only collection → 405. OpenAPI **0.5.0**: tag Notifications + all 4 paths + `Notification` component schema (all confirmed via `GET /api/openapi.json`).

## 26. Render deployment guide (Flutter-frontend testing, 2026-08-11)

Deployed to Render today so the Flutter dev can test how far the backend is built. Render blueprint: `render.yaml` (this repo). `next build` verified passing; live E2E green on Modules 1–4.

### 26.1 What is deployed vs. what is NOT yet
- **Live:** full Phase 1 (auth/OTP, users, properties, DigiPin, QR, location, media) + Phase 2 Modules 1–4 (Search & Location, Business, Trust Score, Notifications).
- **NOT yet:** Subscriptions/Payments + Badges (deferred to the end), Admin Panel (tomorrow, 2026-08-12). **Consequence:** on Render no admin exists yet, so businesses cannot be approved — they stay `PENDING`/`UNDER_REVIEW` and only the owner sees them. Trust score shows live-derived factors (admin recalc column stays `null`). Verification approval is the FIRST thing the admin panel unlocks tomorrow.
- Tests + the `api-test.html` harness are gitignored and never deployed (`/src/tests/`, `vitest.config.ts`, `public/api-test.html`).

### 26.2 One-click deploy (Render Blueprint)
1. Push this repo to GitHub (test files already excluded).
2. Render → New → Blueprint → select the repo → `render.yaml` auto-configures the service.
3. After creation, fill in the **required secrets** under Environment (the first build fails without them):
   - `DATABASE_URL` — MySQL connection string. Render does NOT host MySQL: use Aiven/PlanetScale/Railway or any reachable MySQL. Example: `mysql://user:pass@host:3306/ownmypin?connection_limit=5`
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_HASH_SALT`, `ADMIN_JWT_SECRET` — all **distinct**, ≥32 chars (`openssl rand -hex 64`). The server refuses to boot otherwise (`src/lib/env.ts`).
4. Add your **Flutter Web** origin to `CORS_ALLOWED_ORIGINS` (comma-separated). Mobile/desktop apps send no `Origin` header → unaffected by CORS.
5. Deploy. Build = `npm run prisma:deploy && npm run seed:categories && npm run build`; start = `npm start` (`next start`, auto-uses Render's `PORT`). Health check: `GET /api/categories`.

### 26.3 Environment knobs used for this testing phase
- `OTP_PROVIDER=yourbulksms` — real SMS (dev bypass removed 2026-08-11). Configure `YOURBULKSMS_AUTHKEY` (secret), `YOURBULKSMS_SENDER_ID=URBLKM`, `YOURBULKSMS_DLT_TE_ID` + `YOURBULKSMS_OTP_TEMPLATE` (must match the registered DLT template). ⚠️ SMS OTP still blocked by the template-placeholder issue (see §4) until the template is re-registered with fixed text after the variable.
- `STORAGE_LOCAL_DIR=./public/uploads` + a 1 GB Render Disk mounted at `/opt/render/project/src/public/uploads` → uploads survive redeploys. **Without the disk, uploads are ephemeral (wiped on every redeploy)** — fine for early testing.
- `PUSH_PROVIDER=console` (push is logged, not sent).

### 26.4 From the Flutter app
- Base URL: `https://<your-app>.onrender.com` (the health/Swagger surface is `/api/openapi.json`, docs UI at `/api/docs`).
- Login = `POST /api/auth/send-otp` → `POST /api/auth/verify-otp` (see API_REFERENCE.md §1–2). Each tester uses their own mobile; OTP is delivered via real SMS once the DLT template is fixed.
- Rate limits apply (`RATE_LIMIT_BACKEND=memory`); OTP route is mobile-first rate-limited (3 sends/mobile/10 min), so repeated test sends to one number throttle quickly.

### 26.5 Notes / gotchas
- `swagger-jsdoc` semantic YAML gotcha already fixed (folded `>-` descriptions) so all 4 notification paths emit in the deployed spec.
- `.env` is gitignored; `render.yaml` holds non-secret values only. Secrets live in the Render dashboard.
- `next build` was run and passed locally (17.6 s) before this guide was written.
