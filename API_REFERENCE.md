# OwnMyPin — API Reference (Frontend Integration Guide)

Base URL (dev): **`http://localhost:3000`**
Interactive docs: **`http://localhost:3000/api/docs`** (Swagger UI — click the green **Authorize** button and paste the access token).

All JSON. Two envelope shapes — **check `success` first**:

```jsonc
// Success (2xx/3xx)
{ "success": true, "data": { /* endpoint-specific payload */ } }

// Error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Human-readable detail" } }
```

Special statuses with **no body**: `204 No Content` (logout, delete), `201 Created` (upload/create still return a JSON body).

---

## 1. Authentication & Tokens

| Thing | Value |
|---|---|
| Auth header | `Authorization: Bearer <accessToken>` |
| Access token | JWT, **15 min** — send on every protected call |
| Refresh token | Opaque, **7 days** — rotate when access expires; **one-time use** |

**Two auth paths (both produce the same tokens):**

```
[New users]
POST /api/auth/register  (name + email + mobile + password  →  OTP sent to mobile)
POST /api/auth/register/verify  (mobile + OTP  →  account created + tokens)

[Returning users]
POST /api/auth/login  (mobile + password  →  tokens)

[Token lifecycle — same for both paths]
  → use accessToken (15 min) on every protected request
  → on 401: POST /api/auth/refresh  →  new pair (old refresh revoked)
  → POST /api/auth/logout  (revokes refresh + session)
```

**Rule:** never reuse a refresh token twice. After every `refresh` response, **discard the old refreshToken and store the new one**. Reusing a rotated token revokes the user's entire session family (all devices) with a generic 401.

> **Legacy OTP flow** (`send-otp` / `verify-otp`) remains available for any OTP-only use cases but is no longer the primary auth path.

**Email uniqueness:** email is **not unique** — the same email may exist on multiple accounts. Mobile is the unique account identifier.

---

## 2. Auth endpoints

### POST /api/auth/send-otp — request a login OTP
Public. Sends a 6-digit OTP to the mobile. Rate limited: 3 sends/mobile/10 min + 15/IP/10 min.

```jsonc
// Request
{ "mobile": "9876543210" }        // 10 digits, must start 6-9

// Response 200
{ "success": true, "data": { "message": "OTP sent", "mobile": "9876543210" } }
```

| Error | Status | Code |
|---|---|---|
| Bad mobile / unknown field | 400 | `VALIDATION_ERROR` |
| Too many requests | 429 | `RATE_LIMITED` |

> Dev note: OTP is delivered by **YourBulkSMS** (`OTP_PROVIDER=yourbulksms`). The DLT template is **approved** — real SMS OTPs go to the entered mobile. The dev bypass (`OTP_BYPASS_ENABLED=true`, mobile `8090780908`, code `123456`) can be flipped back on for offline testing; with the `console` provider the OTP is printed in the server log instead (`[ConsoleOtpProvider] OTP for <mobile>: 123456`).

**YourBulkSMS config** (`.env` / `render.yaml`): `YOURBULKSMS_AUTHKEY` (secret, sync:false), `YOURBULKSMS_SENDER_ID=OWNMY`, `YOURBULKSMS_DLT_TE_ID` (approved template ID, `1777178721813553031`), `YOURBULKSMS_ROUTE=2`, `YOURBULKSMS_COUNTRY=0`, `YOURBULKSMS_OTP_TEMPLATE` (DLT-approved message: `Dear User, Your OwnMyPin registration OTP is {#var#}. It is valid for 5 minutes. Please do not share it with anyone.`).

> **Real SMS active:** `OTP_BYPASS_ENABLED=false`. OTPs are sent to the entered mobile via the approved DLT template (verified live 2026-08-20: register → SMS arrives → verify → account + tokens). Flip `OTP_BYPASS_ENABLED=true` only for offline/dev testing with mobile `8090780908` / code `123456`.

### POST /api/auth/register — initiate registration
Public. Validates name/email/mobile/password, stores a pending registration, and sends a 6-digit OTP to the mobile. Rate limited same as send-otp.

```jsonc
// Request
{
  "name": "Anuraj Kumar",
  "email": "anuraj@example.com",
  "mobile": "9876543210",           // 10 digits, must start 6-9
  "password": "SecurePass1"          // min 8 chars, ≥1 uppercase, ≥1 digit
}

// Response 200
{ "success": true, "data": { "message": "OTP sent to your mobile number...", "mobile": "9876543210" } }
```

| Error | Status | Code |
|---|---|---|
| Mobile already registered | 409 | `MOBILE_TAKEN` |
| Weak password / bad format | 400 | `VALIDATION_ERROR` |
| Too many OTP requests | 429 | `RATE_LIMITED` |

### POST /api/auth/register/verify — complete registration with OTP
Public. Verifies the OTP, creates the account, and returns tokens. Max 3 attempts.

```jsonc
// Request
{
  "mobile": "9876543210",
  "otp": "483920",
  "deviceInfo": "Pixel 9 / app 1.0"   // optional
}

// Response 200
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "a3f2...",
    "userId": "cmsl...",
    "isNewUser": true
  }
}
```

| Error | Status | Code |
|---|---|---|
| Wrong OTP | 400 | `OTP_INVALID` |
| Expired / exhausted | 400 | `OTP_EXPIRED` |
| Registration session expired | 400 | `REGISTRATION_EXPIRED` |
| Mobile race conflict | 409 | `MOBILE_TAKEN` |

### POST /api/auth/login — login with mobile + password
Public. All failure paths return the same generic 401 (no mobile-existence leak).

```jsonc
// Request
{
  "mobile": "9876543210",
  "password": "SecurePass1",
  "deviceInfo": "Pixel 9 / app 1.0"   // optional
}

// Response 200
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "a3f2...",
    "userId": "cmsl...",
    "isNewUser": false
  }
}
```

| Error | Status | Code |
|---|---|---|
| Wrong mobile or password | 401 | `INVALID_CREDENTIALS` |
| Account deactivated/deleted | 403 | `ACCOUNT_DISABLED` |

---

## 2. Auth endpoints (legacy OTP flow)

> These routes remain for any OTP-only use cases but are no longer the primary auth path.

### POST /api/auth/send-otp — request a login OTP
Public. Sends a 6-digit OTP to the mobile. Rate limited: 3 sends/mobile/10 min + 15/IP/10 min.
Public. Creates the user on first login. Max 3 attempts per OTP.

```jsonc
// Request
{
  "mobile": "9876543210",
  "otp": "483920",                 // 6 digits
  "deviceInfo": "Samsung S24 / app 1.0"   // optional, shown nowhere sensitive
}

// Response 200
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...",      // send as Bearer for 15 min
    "refreshToken": "a3f2...",           // store securely, rotate on use
    "userId": "cmsl...",
    "isNewUser": true                     // true on first login — drive onboarding
  }
}
```

| Error | Status | Code |
|---|---|---|
| No pending OTP | 400 | `OTP_NOT_FOUND` |
| Wrong OTP / attempts left | 400 | `OTP_INVALID` (message says attempts left) |
| Expired (5 min) / attempts exhausted | 400 | `OTP_EXPIRED` |
| Account deactivated/deleted | 403 | `ACCOUNT_DISABLED` |

### POST /api/auth/refresh — rotate the refresh token
Public. Gives a fresh **pair**; the presented refresh token is revoked.

```jsonc
// Request
{ "refreshToken": "a3f2..." }

// Response 200
{ "success": true, "data": { "accessToken": "eyJhbGciOi...", "refreshToken": "b9c1..." } }

// Error 401 (invalid, expired, OR reused — all identical on purpose)
{ "success": false, "error": { "code": "INVALID_REFRESH_TOKEN", "message": "Refresh token is invalid or expired" } }
```

### POST /api/auth/logout — end the session
Requires Bearer. **The refreshToken must be in the body** (not empty body).

```jsonc
// Request  (Header: Authorization: Bearer <accessToken>)
{ "refreshToken": "a3f2..." }

// Response 204 (empty body)
```

Access token keeps working until its 15-min expiry (stateless by design) — show the user as logged out immediately regardless.

### GET /api/auth/me — current session info
Requires Bearer. Same as `GET /api/users/me`.

```jsonc
// Response 200
{ "success": true, "data": { "id": "cmsl...", "name": "Anuraj", "mobile": "9876543210", "email": null, "profileImage": null, "language": "en", "accountStatus": "ACTIVE", "createdAt": "...", "updatedAt": "..." } }
```

---

## 3. Users

### GET /api/users/me — own profile
Requires Bearer.

```jsonc
// Response 200
{
  "success": true,
  "data": {
    "id": "cmsl...",
    "name": "Anuraj",
    "mobile": "9876543210",
    "email": null,                    // null until set
    "profileImage": "/uploads/users/.../abc.png",   // URL, or null
    "language": "en",
    "accountStatus": "ACTIVE",        // ACTIVE | DEACTIVATED | DELETED
    "createdAt": "2026-08-09T06:30:00.000Z",
    "updatedAt": "2026-08-09T06:30:00.000Z"
  }
}
```

### PATCH /api/users/me — update profile
Requires Bearer. Unknown fields → 400. Empty body → 400.

```jsonc
// Request — send only what changes
{
  "name": "Anuraj",
  "email": "anuraj@example.com",      // or null to clear
  "profileImage": "<fileId from POST /api/media/profile-image>",
  "language": "hi",                   // 2-10 chars
  "accountStatus": "ACTIVE"           // ACTIVE | DEACTIVATED
}

// Response 200 — same UserProfile shape as GET above
```

| Error | Status | Code |
|---|---|---|
| Unknown field / bad value | 400 | `VALIDATION_ERROR` |
| profileImage is not yours / wrong purpose | 400 | `INVALID_MEDIA_FILE` |
| Account deleted | 403 | `ACCOUNT_DELETED` |

### DELETE /api/users/me — delete account (soft)
Requires Bearer. Response **204** (empty). Revokes all sessions.

### GET /api/users/me/trust-score — own trust score + breakdown (Bearer) [Phase 2]

**Read-only** — the score is derived server-side and **never client-settable**; it is persisted only by the platform on admin approve/reject events (Module 7). POST/PATCH return 405.

```jsonc
// Response 200
{ "success": true, "data": {
  "score": 40, "maxScore": 100, "updatedAt": null,   // updatedAt = last admin recalc (null if never recalced)
  "factors": [
    { "code": "VERIFIED_PROPERTY", "label": "Verified property", "points": 0, "units": 0, "details": "0 / 3", "applied": false },
    { "code": "VERIFIED_BUSINESS", "label": "Verified business", "points": 20, "units": 1, "details": "1 / 2", "applied": true },
    { "code": "BUSINESS_IMAGES",   "label": "Business photos",   "points": 5,  "units": 1, "details": "1 / 2", "applied": true },
    { "code": "SELFIE_UPLOADED",   "label": "Identity selfie",   "points": 10, "units": 1, "details": "",      "applied": true },
    { "code": "PROFILE_IMAGE",     "label": "Profile photo",     "points": 5,  "units": 1, "details": "",      "applied": true },
    { "code": "ACCOUNT_AGE",       "label": "Account age",       "points": 0,  "units": 0, "details": "",      "applied": false }
  ],
  "penalties": [
    { "code": "REJECTED_PROPERTY", "label": "Property verification rejected", "points": 0, "units": 0, "details": "0 / 2", "applied": false },
    { "code": "REJECTED_BUSINESS", "label": "Business verification rejected", "points": 0, "units": 0, "details": "0 / 2", "applied": false }
  ] } }
```

Rule table (single source: `trust-score.constants.ts`): `VERIFIED_PROPERTY` +15 (max 3), `VERIFIED_BUSINESS` +20 (max 2), `BUSINESS_IMAGES` +5 per verified business with ≥1 photo (max 2), `SELFIE_UPLOADED` +10, `PROFILE_IMAGE` +5, `ACCOUNT_AGE` alt 5/10/15/20 (30/90/180/365 days); penalties `REJECTED_PROPERTY`/`REJECTED_BUSINESS` −10 each (max 2 each; applies while the rejection is unresolved). **Total clamped to [0, 100].**

`401 UNAUTHORIZED` without a valid access token.

---

## 4. Media uploads

**All uploads:** `POST` with `multipart/form-data`, field name **`file`**. Authorized (Bearer). Accepts **JPEG / PNG / WebP / HEIC**, max **5 MB** (413 otherwise; magic bytes checked — a renamed file is rejected). Response `201`:

```jsonc
{
  "success": true,
  "data": {
    "id": "638713e0fa164069adba18a0e2d1fdab",   // 32-hex fileId — THIS is what you attach
    "purpose": "PROPERTY_IMAGE",                // or SELFIE / PROFILE_IMAGE
    "url": "/uploads/users/cmsl.../abc.png",    // display-ready URL
    "mimeType": "image/png",
    "sizeBytes": 18342,
    "createdAt": "2026-08-09T06:30:00.000Z"
  }
}
```

| Endpoint | Purpose | Slot behavior |
|---|---|---|
| `POST /api/media/profile-image` | profile photo | **Single slot** — uploading replaces the previous one (old file deleted) |
| `POST /api/media/selfie` | verification selfie | **Single slot** — same replace behavior |
| `POST /api/media/property-images` | property photos | **Pool, max 3** — a 4th upload auto-deletes the oldest |

**Delete:** `DELETE /api/media/:fileId` (Bearer). Response `204`. Re-delete or someone else's file → `404 MEDIA_NOT_FOUND`.

### Flutter upload example (Dart)

```dart
final req = http.MultipartRequest(
  'POST', Uri.parse('$base/api/media/property-images'))
  ..headers['Authorization'] = 'Bearer $accessToken'
  ..files.add(await http.MultipartFile.fromPath('file', imagePath));
final res = await req.send();
// 201 -> body.data.id  ->  use it in submit as propertyImages[0]
```

### Media attach points (after upload)

| Where | What you pass |
|---|---|
| `PATCH /api/users/me` | `{ "profileImage": "<fileId from profile-image>" }` |
| `POST /api/properties/:id/submit` | `{ "propertyImages": ["<fileId from property-images>", ...], "selfieImage": "<fileId from selfie>" }` |

---

## 5. Properties

### POST /api/properties — create a draft
Requires Bearer. Only the first 3 fields are required; everything else comes later via PATCH.

```jsonc
// Request
{
  "ownerName": "Anuraj",
  "propertyType": "HOUSE",        // HOUSE | FLAT | OTHER
  "ownershipType": "OWN"          // OWN | RENT | OTHER
}

// Response 201
{
  "success": true,
  "data": {
    "id": "cmslkbykr001wo0vwyo4mxlwm",      // use this id in the URLs below
    "ownerName": "Anuraj",
    "propertyType": "HOUSE",
    "ownershipType": "OWN",
    "address": null,
    "city": null,
    "state": null,
    "pincode": null,
    "latitude": null,
    "longitude": null,
    "verificationStatus": "DRAFT",
    "createdAt": "2026-08-09T06:30:00.000Z",
    "updatedAt": "2026-08-09T06:30:00.000Z"
  }
}
```

### GET /api/properties — list own properties
Requires Bearer. Newest first. Same property shape as above (array in `data`).

### GET /api/properties/:id — one property
Requires Bearer. Foreign/missing id → identical `404 PROPERTY_NOT_FOUND` (no existence leak).

### PATCH /api/properties/:id — fill steps progressively
Requires Bearer. At least one field. **Do NOT send `verificationStatus`** (400 `INVALID_STATUS_TRANSITION`).

```jsonc
// Request — e.g. after the user types their address
{
  "address": "14 Park Street, Ballygunge",
  "city": "Kolkata",
  "state": "West Bengal",          // MUST be the full state name — see below
  "pincode": "700016"
  // "latitude"/"longitude" are OPTIONAL — normally never sent; see Location section
}

// Response 200 — full property object (same shape as create)
```

> **State names:** the submit gate maps **full state/UT names** (e.g. `"Uttar Pradesh"`, `"West Bengal"`, `"Delhi"`) to DigiPin codes. Short forms like `"UP"` fail submit with `400 INVALID_STATE`. Use a state dropdown in the UI.

### POST /api/properties/:id/submit — submit for verification
Requires Bearer. Complete gate — missing anything → `400 PROPERTY_INCOMPLETE`. On success: property becomes SUBMITTED, a **DigiPin** and its **QR** are generated.

```jsonc
// Request
{
  "ownerName": "Anuraj",
  "propertyType": "HOUSE",
  "ownershipType": "OWN",
  "address": "14 Park Street, Ballygunge",
  "city": "Kolkata",
  "state": "West Bengal",
  "pincode": "700016",
  "propertyImages": ["638713e0fa164069adba18a0e2d1fdab", "b1df20e6488a391041a9bddce91e0055"],  // ≥1 fileId, max 3
  "selfieImage": "59f25cfd0eae09bba0b376db476566b1"                                            // exactly one
  // "latitude" / "longitude": optional device GPS — see Location section
}

// Response 200
{
  "success": true,
  "data": {
    "property": { "id": "cmsl...", "verificationStatus": "SUBMITTED" },
    "digipinNumber": "WB629801",     // SAVE THIS — there is no list-DigiPin endpoint yet
    "digipinId": "cmtq..."           // DigiPin row id — use it in GET /api/digipins/:id/qr
  }
}
```

| Error | Status | Code |
|---|---|---|
| Missing/invalid required field | 400 | `PROPERTY_INCOMPLETE` |
| Media not owned / wrong purpose / deleted | 400 | `INVALID_MEDIA_FILE` |
| Short state name (e.g. "UP") | 400 | `INVALID_STATE` |
| Not a DRAFT | 400 | `INVALID_STATUS_TRANSITION` |
| No GPS and address unresolvable | 502 | `GEOCODE_FAILED` |

---

## 6. Location (hybrid — users NEVER type coordinates)

The server geocodes the typed address with OpenStreetMap. Optionally cross-checks device GPS (from the phone's GPS chip, fetched automatically by the app — no user input).

### POST /api/location/verify — geocode + (optional) GPS check
Public. Call this when the user finishes typing the address, to show a map pin or confirm the address resolves.

```jsonc
// Request — address ONLY (typical; app never asks for coordinates)
{ "address": "Marine Drive, Mumbai, Maharashtra 400020" }

// Request — with device GPS (phone chip provides these silently)
{ "address": "Marine Drive, Mumbai, Maharashtra 400020", "latitude": 18.9345, "longitude": 72.8239 }

// Response 200
{
  "success": true,
  "data": {
    "latitude": 18.934561,                  // geocoded from the address (rounded to 6 dp)
    "longitude": 72.82394,
    "formattedAddress": "Marine Drive, Churchgate, Fort, A Ward, Mumbai Zone 1, Mumbai City District, Maharashtra, 400020, India",
    "verified": true,                        // true if GPS within 500 m — OR same city+state (locality match)
    "source": "osm",
    "gps": { "latitude": 18.9345, "longitude": 72.8239 },   // null if no GPS sent
    "distanceMeters": 4,                     // GPS vs geocoded distance; null if no GPS
    "matchBasis": "gps"                      // "gps" (≤500 m) | "locality" (same city+state) | null
  }
}
```

**`verified` semantics:** strict GPS check (`matchBasis: "gps"`) when within **500 m**. If farther, the server reverse-geocodes the GPS point and returns `verified: true` with `matchBasis: "locality"` when it shares the **same city + state** as the typed address (this absorbs coarse OSM pins that can land kilometres from the true spot — e.g. the address resolves to the right locality but Nominatim's pin is 6 km away).

### POST /api/location/reverse — GPS point → place name
Public. Use to auto-fill the address field from the device GPS chip (no user typing).

```jsonc
// Request
{ "latitude": 18.9345, "longitude": 72.8239 }

// Response 200
{ "success": true, "data": { "formattedAddress": "Marine Drive, Churchgate, Fort, A Ward, Mumbai City District, Maharashtra, 400020, India", "source": "osm" } }
```

| Error | Status | Code |
|---|---|---|
| Unknown field / out of range | 400 | `VALIDATION_ERROR` |
| Coordinates unresolvable | 502 | `GEOCODE_FAILED` |

| Error | Status | Code |
|---|---|---|
| Address too short (<5) / unknown field | 400 | `VALIDATION_ERROR` |
| Address unresolvable | 502 | `GEOCODE_FAILED` |

**Submit behavior:** if `latitude`/`longitude` are omitted from submit, the server geocodes `address + city + state + pincode` automatically and stores those coords. So the app **can** simply skip coordinates entirely.

---

## 7. DigiPin & QR

### GET /api/digipins/:id/qr — get the QR for a DigiPin
Requires Bearer. `:id` is the **DigiPin row id** (the `digipinId` returned by submit — persist it), not the 8-char number.

```jsonc
// Response 200
{
  "success": true,
  "data": {
    "qrData": "https://digipin.app/q/a3f2c1e9...",  // render this as the QR image
    "qrStatus": "ACTIVE",                           // ACTIVE | DISABLED
    "token": "a3f2c1e9..."                          // the bare token
  }
}
```

`404 DIGIPIN_NOT_FOUND` for foreign/missing ids.

### POST /api/qr/verify — verify a scanned QR (public, no auth)
Anyone can call this — it returns **no address, no personal data** (privacy-safe for scanning by anyone).

```jsonc
// Request — the BARE hex token (extract after /q/ from qrData)
{ "token": "a3f2c1e9..." }

// Response 200
{
  "success": true,
  "data": {
    "digipinNumber": "WB629801",
    "status": "ACTIVE",                  // ACTIVE | INACTIVE
    "verificationStatus": "SUBMITTED",
    "city": "Kolkata",
    "state": "West Bengal"
  }
}
```

| Error | Status | Code |
|---|---|---|
| Missing token | 400 | `VALIDATION_ERROR` |
| Invalid or disabled QR | 404 | `QR_NOT_FOUND` |
| DigiPin not active | 410 | `DIGIPIN_INACTIVE` |

---

## 8. Search & Location (Phase 2)

All search endpoints are **public** (no auth) except history, which requires Bearer.

**Privacy rule (hard):** search results are *public projections* — for properties only the **DigiPin number + city/state** (never the full address, owner name, selfie, or media); businesses show **name/category/city/state** and only **VERIFIED + ACTIVE** businesses appear.

**Pagination (all search/list endpoints):** `page` (1-based) + `pageSize` (1–100, default 20) → `{ items, total, page, pageSize }`.

### GET /api/search — unified search (q + optional type)

Query params: `q` (required, 1–200 chars), `type` (`digipin` | `address` | `business` | `all`, default `all`), `page`, `pageSize`.

```jsonc
// GET /api/search?q=WB&type=all
{
  "success": true,
  "data": {
    "items": [
      { "kind": "property", "id": "cmsl...", "digipinId": "cmsl...", "digipinNumber": "WB105516",
        "city": "Kolkata", "state": "West Bengal", "verificationStatus": "SUBMITTED",
        "latitude": 22.5493, "longitude": 88.3566 },
      { "kind": "business", "id": "cmsl...", "name": "Cafe Kolkata", "categoryName": "Cafe",
        "city": "Kolkata", "state": "West Bengal", "verificationStatus": "VERIFIED",
        "latitude": 22.56, "longitude": 88.36 }
    ],
    "total": 2, "page": 1, "pageSize": 20
  }
}
```

- `type=digipin` matches the DigiPin number only; `type=address` matches address/city/state/pincode; `type=all` matches number **OR** address fields (properties first, then businesses).
- Only submitted properties (rows with a DigiPin) are searchable.
- `400 VALIDATION_ERROR` if `q` is missing or `pageSize > 100`.

### GET /api/search/nearby — combined nearby (properties + businesses)

Query params: `lat`, `lng` (required), `radiusKm` (0.1–100, default 5), `page`, `pageSize`.

Uses **stored coordinates (haversine)** — no geocoder call at query time. Results sorted by distance; each item gains `distanceMeters` (rounded int). `total` = matches within the radius.

```jsonc
{ "success": true, "data": {
    "items": [ { "kind": "property", "digipinNumber": "UP499807", "distanceMeters": 342, "...": "" } ],
    "total": 1, "page": 1, "pageSize": 20 } }
```

### GET /api/locations/nearby — radius search by type

Same as `/api/search/nearby` plus an explicit `type` param: `property` | `business` | `all` (default `all`).

### GET /api/search/history — the user's recent searches (Bearer)

Returns the current user's search history, newest first, **pruned to the last 50** per user.

```jsonc
{ "success": true, "data": {
    "items": [ { "id": "cmso...", "query": "Varanasi", "type": "address", "createdAt": "2026-08-11T10:27:36.905Z" } ],
    "total": 1, "page": 1, "pageSize": 20 } }
```

### POST /api/search/history — record a search (Bearer)

```jsonc
// Request
{ "query": "Varanasi", "type": "address" }   // type optional (default all)

// Response 201
{ "success": true, "data": { "id": "cmso...", "query": "Varanasi", "type": "address", "createdAt": "2026-08-11T10:27:36.905Z" } }
```

`401 UNAUTHORIZED` for all history calls without a valid access token.

---

## 9. Business & Categories (Phase 2)

**Visibility rule (hard):** a business is publicly visible **only when VERIFIED + ACTIVE**. Directory/list cards and the public detail carry basic info only; the public **detail** additionally exposes contact (phone/email) once VERIFIED + ACTIVE. Owners always see their own business (full detail) at any status. **No-existence-leak:** a non-verified business requested by a non-owner returns the same `404 BUSINESS_NOT_FOUND` as a missing id.

**Statuses:** `verificationStatus` = `PENDING` (new) → `UNDER_REVIEW` (via verification-request) → `VERIFIED` | `REJECTED` (admin, Module 7); `status` = `ACTIVE` | `SUSPENDED`. Users can **never** set `verificationStatus`/`ownerUserId` (rejected by strict schema + service guard).

**Pagination** (all list endpoints): `page` + `pageSize` (1–100, default 20) → `{ items, total, page, pageSize }`.

### POST /api/businesses — create a business (Bearer, USER)

Body: `name` (required), `categoryId` (required, active category), `subcategoryId` (optional), `description`, `address`, `city`, `state`, `pincode`, `latitude`, `longitude`, `contactPhone`, `contactEmail`, `website`, `openingHours`, `socialLinks`. Creates a **PENDING + ACTIVE** business owned by the current user. Category must be active and (if given) the subcategory must belong to the selected category → else `400 VALIDATION_ERROR`.

```jsonc
// Response 201
{ "success": true, "data": {
  "id": "cmsolam...", "name": "Ganga Cafe", "verificationStatus": "PENDING", "status": "ACTIVE",
  "category": { "id": "cmsol7jyg...", "name": "Food & Dining" }, "subcategory": { "id": "cmsol7jzu...", "name": "Cafe" },
  "city": "Varanasi", "state": "Uttar Pradesh", "latitude": 25.2884, "longitude": 83.0066, "..." : "" } }
```

### GET /api/businesses — public directory OR own list (public + mine=true)

- Without `mine=true` → **public** directory: only VERIFIED + ACTIVE businesses, **never contact/address/images** (cards show name, city, state, status, coords, logo, category, subcategory). Filters: `q` (name/city/state), `categoryId`, `city`, `state`, `lat`+`lng`+`radiusKm` (0.1–100, distance-sorted with `distanceMeters`), pagination.
- With `mine=true` → **Bearer USER**: the current user's businesses, each with **full detail** (contact + media) at any status.

```jsonc
// Public card
{ "success": true, "data": { "items": [
  { "id": "cmsolam...", "name": "Ganga Cafe", "city": "Varanasi", "state": "Uttar Pradesh",
    "verificationStatus": "VERIFIED", "status": "ACTIVE", "latitude": 25.2884, "longitude": 83.0066,
    "logoUrl": "/uploads/.../BUSINESS_LOGO/413f....png",
    "category": { "id": "cmsol7jyg...", "name": "Food & Dining" }, "subcategory": { "id": "cmsol7jzu...", "name": "Cafe" } } ],
  "total": 1, "page": 1, "pageSize": 20 } }
```

### GET /api/businesses/:id — public-safe detail (public via optionalAuth)

- VERIFIED + ACTIVE → whoever: full detail **with contact** (phone/email) + media (images, logo) + category/subcategory.
- NOT verified → **owner only** sees full detail; anyone else gets the same `404 BUSINESS_NOT_FOUND` as a missing id (no existence leak).

### PATCH /api/businesses/:id — update own business (Bearer, USER owner)

Body: any create field. `verificationStatus`/`ownerUserId` are **not** in the schema → `400 VALIDATION_ERROR`; a status transition attempt is additionally blocked by the service. Owner-only: another user's business → `404 BUSINESS_NOT_FOUND`.

### POST /api/businesses/:id/verification-request — request admin review (Bearer, USER owner)

Gate (400 `BUSINESS_INCOMPLETE` naming the missing fields): requires `name`, `categoryId`, `address`, `city`, `state`, ≥1 image, and a contact (phone or email). Allowed only from `PENDING`/`REJECTED` → `UNDER_REVIEW` (else `400 INVALID_STATUS_TRANSITION`). If the business has no coordinates, they are **geocoded** at this step (reuses the location module). Admin approval/rejection comes in Module 7.

```jsonc
// Response 200 — starts UNDER_REVIEW; coords geocoded if they were missing
{ "success": true, "data": { "id": "cmsolam...", "verificationStatus": "UNDER_REVIEW", "status": "ACTIVE", "..." : "" } }
```

### GET /api/categories — active category tree (public)

Top-level categories with their active subcategories (for the business form).

```jsonc
{ "success": true, "data": { "items": [
  { "id": "cmsol7jyg...", "name": "Food & Dining", "subcategories": [
    { "id": "cmsol7jzu...", "name": "Cafe" } ] } ], "total": 6 } }
```

### Business media (Bearer, USER owner)

- `POST /api/media/business-images` — multipart `file` + `businessId`; PNG/JPEG magic-byte validated; **max 5 images** per business (6th → `400 BUSINESS_IMAGE_LIMIT`). Response includes `id`, `fileId`, `url`, `order`.
- `POST /api/media/business-logo` — multipart `file` + `businessId`; **single-slot** (replaces + deletes the previous logo file).
- `DELETE /api/media/business-images/:businessImageId` — 204 on success; foreign/unknown → 404.

---

## 10. Notifications (Phase 2, USER-only)

**All endpoints require Bearer (USER) and act on the CALLER's own notifications only.** Push is best-effort: an in-app `Notification` row is always the source of truth; `PUSH_PROVIDER` defaults to `console` (FCM drops in later).

Notification shape `NotificationType` ∈ `BUSINESS_VERIFICATION | PROPERTY_VERIFICATION | SUBSCRIPTION | SYSTEM | ADMIN`:

```jsonc
{ "id": "cmsln...", "title": "Verification approved", "message": "Your business is live",
  "type": "BUSINESS_VERIFICATION", "readStatus": false, "createdAt": "2026-08-11T..." }
```

### GET /api/notifications — list the caller's notifications (paginated, Bearer)

Query: `page` + `pageSize` (1-100, default 20), optional `filter` = `all` | `read` | `unread` (default `all`).

```jsonc
// Response 200
{ "success": true, "data": {
  "items": [ /* Notification... */ ],
  "total": 2, "unread": 1,           // unread tally = badge without a 2nd request
  "page": 1, "pageSize": 20 } }
```

`401` without a valid token.

### PATCH /api/notifications/:id/read — mark one read (Bearer)

Owner-only + idempotent. A **foreign or missing** id returns the same `404 NOTIFICATION_NOT_FOUND` (no existence leak).

```jsonc
// Response 200
{ "success": true, "data": { "id": "...", "title": "...", "message": "...", "type": "SYSTEM", "readStatus": true, "createdAt": "..." } }
```

### POST /api/notifications/read-all — mark all of the caller's notifications read (Bearer)

```jsonc
// Response 200
{ "success": true, "data": { "updatedCount": 1 } }
```

### POST /api/notifications/device-token — register a push token (Bearer)

Body: `fcmToken` (1-512), `platform` = `ANDROID | IOS | WEB`. Upserts by (user, fcmToken) — re-registering only refreshes the platform. **Self-registration only; there is no send-to-anyone route** (admin broadcast is Module 7).

```jsonc
// Response 201
{ "success": true, "data": { "id": "cmsl...", "fcmToken": "fcm:...", "platform": "IOS", "createdAt": "..." } }
```

### DELETE /api/notifications/device-token?fcmToken=... — unregister (Bearer)

**204** on success; `404 DEVICE_TOKEN_NOT_FOUND` if the token isn't registered for this user.

---

## 11. Common error codes (any endpoint)

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing/invalid/expired **access token** |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token invalid, expired, or **already used** |
| `VALIDATION_ERROR` | 400 | Bad payload, wrong type, or **unknown field** (strict schemas) |
| `INVALID_JSON` | 400 | Body is not valid JSON |
| `RATE_LIMITED` | 429 | OTP / general rate limit hit; message includes `retryAfterSeconds` |
| `CORS_DENIED` | 403 | Request came from a browser Origin not in `CORS_ALLOWED_ORIGINS` |
| `INTERNAL_SERVER_ERROR` | 500 | Server bug — report it |

Media-only: `EMPTY_BODY` 400, `INVALID_CONTENT_TYPE` 400, `FILE_REQUIRED` 400, `EMPTY_FILE` 400, `INVALID_FILE_TYPE` 400, `INVALID_FILE_KEY` 400, `FILE_TOO_LARGE` 413, `MALFORMED_UPLOAD` 400.
Ownership: `MEDIA_NOT_FOUND` 404, `PROPERTY_NOT_FOUND` 404, `DIGIPIN_NOT_FOUND` 404, `QR_NOT_FOUND` 404, `USER_NOT_FOUND` 404, `BUSINESS_NOT_FOUND` 404, `BUSINESS_IMAGE_NOT_FOUND` 404, `NOTIFICATION_NOT_FOUND` 404, `DEVICE_TOKEN_NOT_FOUND` 404.
Account: `ACCOUNT_DISABLED` 403 (deactivated/deleted), `ACCOUNT_DELETED` 403.
Business: `BUSINESS_INCOMPLETE` 400 (verification-request gate, lists missing fields), `INVALID_STATUS_TRANSITION` 400, `BUSINESS_IMAGE_LIMIT` 400 (max 5), `CATEGORY_INVALID` 400.

---

## 12. Suggested client flow (screens in order)

1. **Login screen** → `send-otp` → `verify-otp` → store both tokens → if `isNewUser`, show onboarding.
2. **Profile** → `PATCH /api/users/me` after uploading `profile-image`.
3. **Property form (multi-step)** →
   - create: `POST /api/properties` (draft id)
   - step 1–3 (name/type/ownership): already at create
   - address step: `PATCH /api/properties/:id` (address/city/state/pincode) + `location/verify` for a map pin
   - photos step: upload to `property-images` (max 3, show replace-toast on 4th) and `selfie`
   - review & submit: `submit` → show the **DigiPin** prominently + fetch QR via `GET /api/digipins/:id/qr` (requires digipin id — store it from the submit response).
4. **Token upkeep** → on any 401, call `refresh`, update stored tokens, retry once; if refresh 401s, force re-login.

---

## 13. Dev/test reference values

- **API test lab (dev harness):** `http://localhost:3000/api-test.html` — same-origin page exercising every endpoint (bypass login, profile, media uploads, location verify with map + GPS auto-fill, property → DigiPin + QR). Serve of convenience, not part of the app, **and not deployed** (gitignored).
- Login mobile for existing account: `8090780908` (name "Anuraj", ACTIVE).
- **OTP in dev:** real SMS active (`OTP_BYPASS_ENABLED=false`) via the approved DLT template — register an account and the OTP arrives on the entered mobile. For offline testing only, flip bypass on for `8090780908` → fixed code `123456` (no SMS sent; server does NOT log the code).
- Live DigiPins in dev DB: `UP499807` (SUBMITTED), `UP725207` (SUBMITTED), `WB105516` (SUBMITTED), `WB855216` (SUBMITTED), `UP617510` (SUBMITTED).
- Swagger spec: `GET /api/openapi.json` (version 0.5.0) · Swagger UI: `/api/docs` · Postman collection: `postman/ownmypin.postman_collection.json`.

---

## 14. Deployment (Render) quick-start

Deployed to **Render** today for Flutter-frontend testing. Blueprint: `render.yaml` in the repo (`buildCommand: npm run prisma:deploy && npm run seed:categories && npm run build`, `startCommand: npm start`, health check `GET /api/categories`). Full guide: `doc.md §26`.

1. **Push repo** to GitHub — test files + harness are gitignored (`/src/tests/`, `vitest.config.ts`, `public/api-test.html`) and never deployed.
2. **Render → New → Blueprint** → pick the repo → `render.yaml` auto-configures.
3. **Fill required secrets** (first build fails without them): `DATABASE_URL` (external MySQL — Aiven/PlanetScale/etc., Render has none), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_HASH_SALT`, `ADMIN_JWT_SECRET` — all distinct, ≥32 chars.
4. **Flutter Web** → add your web origin to `CORS_ALLOWED_ORIGINS` (mobile apps are unaffected by CORS — no Origin header).
5. **Base URL for the app:** `https://<your-app>.onrender.com`. Auth: register via real-SMS OTP on the entered mobile, then login with mobile + password. Legacy bypass (`8090780908` / `123456`) only when `OTP_BYPASS_ENABLED=true`.

**What is live:** Phase 1 + Phase 2 Modules 1–4 (Search, Business, Trust Score, Notifications). **Module 7 Admin Panel: code complete, E2E pending** — all routes are built and lint-clean; `npm run admin:seed` seeds the first SUPER_ADMIN. Subscriptions/Payments + Badges remain deferred. Until the E2E pass is complete and Render is redeployed, businesses still can't be approved on Render. Uploads live on a Render disk; without it they're ephemeral across redeploys.

---

## 12. Admin Panel

> **Separate URL prefix:** `/admin/*` — NOT `/api/admin/*`. Admin tokens use `ADMIN_JWT_SECRET` and are completely isolated from user tokens.

### 12.1 Admin Token Flow

```
1. POST /admin/auth/login → { admin, accessToken, refreshToken }
2. Use:  Authorization: Bearer <accessToken>   (15 min)
3. POST /admin/auth/refresh { refreshToken } → new { accessToken, refreshToken }  (rotate)
4. POST /admin/auth/logout  { refreshToken } → 204
```

**Rate limits on login:** 5 attempts / email / 15 min + 15 attempts / IP / 15 min.

**First-time setup:** run `npm run admin:seed` (or `node scripts/seed-admin.mjs`) to create the first SUPER_ADMIN from `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` in `.env`. Idempotent — safe to run multiple times.

### 12.2 Roles & Capabilities

| Role | Who |
|---|---|
| `SUPER_ADMIN` | Full access to everything |
| `ADMIN` | Users, dashboard, digipins, businesses (read), broadcast — no verification or finance |
| `VERIFICATION_ADMIN` | View + approve/reject properties and businesses only |
| `CONTENT_ADMIN` | Categories CRUD + broadcast only |
| `FINANCE_ADMIN` | Plans CRUD + subscriptions/transactions view only |

### 12.3 Auth Routes

**`POST /admin/auth/login`** — Public, rate-limited
```jsonc
// Request
{ "email": "admin@example.com", "password": "MyAdminPass123!" }

// Response 200
{
  "success": true,
  "data": {
    "admin": { "id": "...", "email": "admin@example.com", "name": "Super Admin", "role": "SUPER_ADMIN" },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}

// Errors
401 INVALID_ADMIN_CREDENTIALS — wrong email or password
401 ADMIN_INACTIVE          — account deactivated
429 RATE_LIMITED            — too many attempts (includes retryAfterSeconds)
```

**`POST /admin/auth/refresh`** — Public
```jsonc
// Request
{ "refreshToken": "eyJ..." }
// Response: same shape as login (new tokens)
// 401 INVALID_REFRESH_TOKEN / TOKEN_REUSE_DETECTED / REFRESH_TOKEN_EXPIRED
```

**`POST /admin/auth/logout`** — Requires admin token
```jsonc
// Request
{ "refreshToken": "eyJ..." }
// Response: 204 No Content
```

**`GET /admin/auth/me`** — Requires admin token
```jsonc
// Response 200
{ "success": true, "data": { "id": "...", "email": "...", "name": "...", "role": "SUPER_ADMIN" } }
```

### 12.4 Admin Management (SUPER_ADMIN only)

**`GET /admin/admins?page=1&pageSize=20`**
```jsonc
{ "admins": [ { "id": "...", "email": "...", "name": "...", "role": "ADMIN", "isActive": true, "createdAt": "..." } ],
  "total": 3, "page": 1, "pageSize": 20, "totalPages": 1 }
```

**`POST /admin/admins`**
```jsonc
// Request
{ "name": "Verif Admin", "email": "verif@example.com", "password": "TempPass123!",
  "role": "VERIFICATION_ADMIN"  // SUPER_ADMIN | ADMIN | VERIFICATION_ADMIN | CONTENT_ADMIN | FINANCE_ADMIN
}
// 409 ADMIN_EMAIL_EXISTS
```

**`PATCH /admin/admins/:id`**
```jsonc
// Request (all optional)
{ "role": "ADMIN", "isActive": false }
// 400 CANNOT_DEACTIVATE_SELF
// 400 LAST_SUPER_ADMIN — cannot demote or deactivate the only SUPER_ADMIN
```

### 12.5 Dashboard

**`GET /admin/dashboard`** — requires `dashboard` capability
```jsonc
{
  "users":    { "total": 42, "active": 40, "deactivated": 2, "newThisWeek": 5, "newThisMonth": 12 },
  "digipins": { "total": 35, "verified": 28, "pending": 7 },
  "businesses": { "total": 18, "verified": 10, "pending": 8 },
  "subscriptions": { "activeCount": 0, "allTimeRevenue": 0, "thisMonthRevenue": 0 },
  "recentActivity": {
    "registrations": [ /* last 10 users */ ],
    "transactions":  [ /* last 10 transactions */ ],
    "broadcasts":    [ /* last 10 broadcasts */ ]
  }
}
```

### 12.6 User Management

**`GET /admin/users`** — requires `users:read`
Query: `page`, `pageSize`, `status` (ACTIVE|DEACTIVATED|DELETED), `search` (name/mobile/email), `sortBy`, `sortOrder`

**`GET /admin/users/:id`** — requires `users:read`
Returns full user profile including properties, businesses, notifications (last 10), subscriptions, and derived badges.

**`PATCH /admin/users/:id/status`** — requires `users:manage`
```jsonc
{ "accountStatus": "DEACTIVATED" }  // or "ACTIVE"
// Deactivating immediately revokes all user refresh tokens + sessions
// 400 ACCOUNT_DELETED — can't modify deleted accounts
```

### 12.7 Property & DigiPin Management

**`GET /admin/properties`** — requires `property:read`
Query: `page`, `pageSize`, `verificationStatus`, `city`, `state`, `search`, `sortBy`, `sortOrder`

**`GET /admin/properties/:id`** — requires `property:read`
Returns property + DigiPin (incl. QR) + owner (name/mobile/email) + media files (PROPERTY_IMAGE + SELFIE).

**`PATCH /admin/properties/:id/verification`** — requires `property:verify`
```jsonc
// Request
{ "action": "APPROVE" }            // or "REJECT"
{ "action": "REJECT", "reason": "Unclear selfie" }   // reason required for REJECT

// APPROVE → sets verificationStatus=VERIFIED on property + DigiPin + triggers recalculateTrustScore + notifyUser
// REJECT  → sets REJECTED + notifyUser with reason
// 400 REASON_REQUIRED  — REJECT without reason
// 400 INVALID_STATUS_TRANSITION — already VERIFIED
```

**`GET /admin/digipins`** — requires `digipin:read`
Query: `page`, `pageSize`, `search`, `sortBy`, `sortOrder`

**`PATCH /admin/digipins/:id/status`** — requires `digipin:status`
```jsonc
{ "status": "INACTIVE" }   // or "ACTIVE"
```

### 12.8 Business Management

**`GET /admin/businesses`** — requires `business:read`
Query: `page`, `pageSize`, `verificationStatus`, `categoryId`, `city`, `sortBy`, `sortOrder`

**`GET /admin/businesses/:id`** — requires `business:read`
Full detail including category, subcategory, all images, owner info.

**`PATCH /admin/businesses/:id/verification`** — requires `business:verify`
```jsonc
{ "action": "APPROVE" }
{ "action": "REJECT",   "reason": "Incomplete documents" }
{ "action": "SUSPEND",  "reason": "Policy violation" }
// APPROVE → VERIFIED + recalcTrustScore + notify
// REJECT/SUSPEND → reason required + notify
// 400 REASON_REQUIRED | INVALID_STATUS_TRANSITION
```

**`GET /admin/categories`** — requires `category:manage` — includes inactive categories

**`POST /admin/categories`** — requires `category:manage`
```jsonc
{ "name": "Health & Wellness", "parentId": null, "order": 5 }
// parentId = null → top-level; parentId = "<id>" → subcategory
// 404 CATEGORY_NOT_FOUND if parentId invalid
```

**`PATCH /admin/categories/:id`** — requires `category:manage`
```jsonc
{ "name": "Healthcare", "order": 3, "isActive": false }
```

### 12.9 Subscription Plans & Finance

**`GET /admin/subscription-plans`** — requires `plan:manage` — all plans incl. inactive

**`POST /admin/subscription-plans`** — requires `plan:manage`
```jsonc
{ "name": "Business Pro", "tier": "PREMIUM", "price": 999, "durationDays": 30,
  "features": { "maxListings": 5, "verifiedBadge": true }, "isActive": true }
```

**`PATCH /admin/subscription-plans/:id`** — requires `plan:manage`
```jsonc
{ "isActive": false }   // deactivating stops new purchases but doesn't cancel existing
```

**`GET /admin/subscriptions`** — requires `finance:view`
Query: `page`, `pageSize`, `status`, `planId`, `userId`, `sortBy`, `sortOrder`

**`GET /admin/transactions`** — requires `finance:view`
Query: `page`, `pageSize`, `status`, `userId`, `dateFrom` (ISO), `dateTo` (ISO), `search` (paymentReference), `sortBy`, `sortOrder`

### 12.10 Notifications & Broadcast

**`POST /admin/notifications/send`** — requires `notify:broadcast`
```jsonc
// Target all active users
{ "target": "ALL", "title": "New Feature!", "message": "Check out...", "type": "SYSTEM" }

// Target a specific user
{ "target": "USER", "userId": "<userId>", "title": "Your property was reviewed", "message": "...", "type": "PROPERTY_VERIFICATION" }

// Target a segment
{ "target": "SEGMENT", "segment": "BUSINESS_OWNERS",  "title": "...", "message": "...", "type": "SYSTEM" }
{ "target": "SEGMENT", "segment": "VERIFIED_USERS",   "title": "...", "message": "...", "type": "SYSTEM" }

// Response: the created Broadcast record incl. sentCount
// 400 USER_ID_REQUIRED — target=USER without userId
// 404 USER_NOT_FOUND  — target=USER with invalid userId
```

**Notification types:** `PROPERTY_VERIFICATION` | `BUSINESS_VERIFICATION` | `SUBSCRIPTION` | `PAYMENT` | `SYSTEM`

**`GET /admin/notifications`** — requires `notify:broadcast`
Query: `page`, `pageSize` — returns paginated **Broadcast** records (the admin-sent log), not individual user notifications.

### 12.11 Error Code Reference (Admin-specific)

| Code | Status | When |
|---|---|---|
| `MISSING_ADMIN_TOKEN` | 401 | No Authorization header on protected admin route |
| `INVALID_ADMIN_TOKEN` | 401 | Token is invalid, expired, or not an admin token |
| `ADMIN_INACTIVE` | 401 | Admin account has been deactivated |
| `INSUFFICIENT_ADMIN_PERMISSIONS` | 403 | Token is valid but role lacks the required capability |
| `INVALID_ADMIN_CREDENTIALS` | 401 | Wrong email or password on login |
| `TOKEN_REUSE_DETECTED` | 401 | Refresh token was already used (family revoked) |
| `REFRESH_TOKEN_EXPIRED` | 401 | Refresh token TTL has passed |
| `ADMIN_EMAIL_EXISTS` | 409 | Creating admin with already-registered email |
| `ADMIN_NOT_FOUND` | 404 | PATCH on non-existent admin id |
| `CANNOT_DEACTIVATE_SELF` | 400 | Admin trying to deactivate their own account |
| `LAST_SUPER_ADMIN` | 400 | Cannot demote or deactivate the only SUPER_ADMIN |
| `REASON_REQUIRED` | 400 | REJECT/SUSPEND action without `reason` field |
| `INVALID_STATUS_TRANSITION` | 400 | e.g. approving an already-VERIFIED item |
| `USER_ID_REQUIRED` | 400 | Broadcast target=USER without userId |
| `RATE_LIMITED` | 429 | Login rate limit hit (includes `retryAfterSeconds`) |
