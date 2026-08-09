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

> Dev note: with the console provider the OTP is printed in the server log (`[ConsoleOtpProvider] OTP for <mobile>: 123456`).

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
    "digipinNumber": "WB629801"     // SAVE THIS — there is no list-DigiPin endpoint yet
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
    "latitude": 18.9345609,                 // geocoded from the address
    "longitude": 72.8239395,
    "formattedAddress": "Marine Drive, Churchgate, Fort, A Ward, Mumbai Zone 1, Mumbai City District, Maharashtra, 400020, India",
    "verified": true,                        // true only if GPS within 500 m of the address
    "source": "osm",
    "gps": { "latitude": 18.9345, "longitude": 72.8239 },   // null if no GPS sent
    "distanceMeters": 4                      // GPS vs geocoded distance; null if no GPS
  }
}
```

| Error | Status | Code |
|---|---|---|
| Address too short (<5) / unknown field | 400 | `VALIDATION_ERROR` |
| Address unresolvable | 502 | `GEOCODE_FAILED` |

**Submit behavior:** if `latitude`/`longitude` are omitted from submit, the server geocodes `address + city + state + pincode` automatically and stores those coords. So the app **can** simply skip coordinates entirely.

---

## 7. DigiPin & QR

### GET /api/digipins/:id/qr — get the QR for a DigiPin
Requires Bearer. `:id` is the **DigiPin row id**, not the 8-char number (in Phase 1 the client persists the digipin id from the submit response).

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

## 8. Common error codes (any endpoint)

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
Ownership: `MEDIA_NOT_FOUND` 404, `PROPERTY_NOT_FOUND` 404, `DIGIPIN_NOT_FOUND` 404, `QR_NOT_FOUND` 404, `USER_NOT_FOUND` 404.
Account: `ACCOUNT_DISABLED` 403 (deactivated/deleted), `ACCOUNT_DELETED` 403.

---

## 9. Suggested client flow (screens in order)

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

## 10. Dev/test reference values

- Login mobile for existing account: `8090780908` (name "Anuraj", ACTIVE).
- OTP in dev: printed to the server console log, e.g. `[ConsoleOtpProvider] OTP for 8090780908: 719101`.
- Live DigiPins in dev DB: `UP499807` (SUBMITTED), `UP725207` (SUBMITTED).
- Swagger spec: `GET /api/openapi.json` · Postman collection: `postman/ownmypin.postman_collection.json`.
