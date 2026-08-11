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

**Token flow (must follow exactly):**

```
send-otp → verify-otp (get accessToken + refreshToken)
  → [use accessToken for 15 min]
  → on 401: refresh (post refreshToken, get a NEW pair — old refresh dies)
  → logout (post current refreshToken)
```

**Rule:** never reuse a refresh token twice. After every `refresh` response, **discard the old refreshToken and store the new one**. Reusing a rotated token revokes the user's entire session family (all devices) with a generic 401.

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

> Dev note: OTP is delivered by **YourBulkSMS** (`OTP_PROVIDER=yourbulksms`) as the only path — the old console/dev bypass was removed on 2026-08-11. The SMS text is the approved DLT template from `YOURBULKSMS_OTP_TEMPLATE` with `{code}` substituted for the 6 digits. With the `console` provider the OTP is printed in the server log instead (`[ConsoleOtpProvider] OTP for <mobile>: 123456`).

**YourBulkSMS config** (`.env` / `render.yaml`): `YOURBULKSMS_AUTHKEY` (secret, sync:false), `YOURBULKSMS_SENDER_ID=URBLKM`, `YOURBULKSMS_DLT_TE_ID` (registered template ID, currently `1707163456288183577`), `YOURBULKSMS_ROUTE=2`, `YOURBULKSMS_COUNTRY=0`, `YOURBULKSMS_OTP_TEMPLATE` (must match the registered DLT template byte-for-byte after `{code}` substitution; template `1707163456288183577` = `Your OwnMyPin OTP is {#var#}`).

> ⚠️ **DLT placeholder gotcha (open):** the registered template currently ends at `{#var#}` (variable = last char) which fails operator matching with "Template not Matched" (633/5307). Fix = register a template with fixed text after the variable, e.g. `Your OwnMyPin OTP is {#var#}. Valid for 5 minutes. Do not share it.`, update `YOURBULKSMS_DLT_TE_ID` + `YOURBULKSMS_OTP_TEMPLATE` accordingly, then the code reaches the phone.

### POST /api/auth/verify-otp — verify OTP, get tokens
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
- **OTP in dev:** real SMS via YourBulkSMS only — dev bypass removed 2026-08-11 (`OTP_BYPASS_ENABLED=false`, bypass block commented out of `otp.service.ts`). `OTP_PROVIDER=yourbulksms`. ⚠️ Currently blocked: template `1707163456288183577` ends at `{#var#}` → operator rejects with "Template not Matched"; needs a template with fixed text after the variable. Until then `verify-otp` has no code to check.
- Live DigiPins in dev DB: `UP499807` (SUBMITTED), `UP725207` (SUBMITTED), `WB105516` (SUBMITTED), `WB855216` (SUBMITTED), `UP617510` (SUBMITTED).
- Swagger spec: `GET /api/openapi.json` (version 0.5.0) · Swagger UI: `/api/docs` · Postman collection: `postman/ownmypin.postman_collection.json`.

---

## 14. Deployment (Render) quick-start

Deployed to **Render** today for Flutter-frontend testing. Blueprint: `render.yaml` in the repo (`buildCommand: npm run prisma:deploy && npm run seed:categories && npm run build`, `startCommand: npm start`, health check `GET /api/categories`). Full guide: `doc.md §26`.

1. **Push repo** to GitHub — test files + harness are gitignored (`/src/tests/`, `vitest.config.ts`, `public/api-test.html`) and never deployed.
2. **Render → New → Blueprint** → pick the repo → `render.yaml` auto-configures.
3. **Fill required secrets** (first build fails without them): `DATABASE_URL` (external MySQL — Aiven/PlanetScale/etc., Render has none), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_HASH_SALT`, `ADMIN_JWT_SECRET` — all distinct, ≥32 chars.
4. **Flutter Web** → add your web origin to `CORS_ALLOWED_ORIGINS` (mobile apps are unaffected by CORS — no Origin header).
5. **Base URL for the app:** `https://<your-app>.onrender.com`. Test login: real SMS OTP to the tester's mobile (bypass is removed). ⚠️ SMS blocked until the YourBulkSMS template placeholder issue is fixed (see §2 send-otp).

**What is live:** Phase 1 + Phase 2 Modules 1–4 (Search, Business, Trust Score, Notifications). **What is NOT live yet:** Subscriptions/Payments + Badges (deferred to the end), Admin Panel (tomorrow). Until the admin panel ships, businesses can't be approved on Render — they stay `PENDING`/`UNDER_REVIEW` (owner-only visibility). Uploads live on a Render disk; without it they're ephemeral across redeploys.
