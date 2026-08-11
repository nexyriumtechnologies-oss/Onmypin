/**
 * Shared OpenAPI 3.0 definition — single source of truth for both
 * `GET /api/openapi.json` (Next.js) and `npm run export:postman` (script).
 * Route details come from @swagger JSDoc annotations in the route files
 * under src/app/api.
 */
module.exports = {
  openapi: "3.0.0",
  info: {
    title: "OwnMyPin API",
    version: "0.5.0",
    description:
      "OwnMyPin backend — Phase 1 (auth/OTP, users, properties, DigiPin, QR, location, media) + Phase 2 (search, businesses, trust score, notifications, subscriptions, badges, admin).\n\n" +
      "1. POST /api/auth/send-otp, then POST /api/auth/verify-otp to get tokens.\n" +
      "2. Click the green **Authorize** button, paste `Bearer <accessToken>`, and every protected route is unlocked.\n" +
      "3. Admin routes use a SEPARATE token (POST /api/admin/auth/login → `AdminBearerAuth`) — user tokens are never accepted there.",
  },
  servers: [{ url: "http://localhost:3000", description: "Local development" }],
  tags: [
    { name: "Auth", description: "OTP login, token refresh, logout, current user" },
    { name: "Users", description: "Own-profile management (name, email, profile image, language)" },
    { name: "Properties", description: "Property draft → step-fill → submit" },
    { name: "DigiPin", description: "Generated on property submit" },
    { name: "QR", description: "QR tokens for DigiPins and public verification" },
    { name: "Location", description: "Address geocoding + GPS cross-check (Nominatim osm / mock provider)" },
    { name: "Media", description: "Image upload / delete and fileId attach" },
    { name: "Search", description: "Unified search, nearby search, search history" },
    { name: "Business", description: "Business profiles, categories, business images, verification requests" },
    { name: "Trust Score", description: "Server-derived user trust score + factor breakdown" },
    { name: "Notifications", description: "In-app notifications + device-token (push) registration" },
    { name: "Subscriptions", description: "Plans, purchase, verify, cancel, entitlements" },
    { name: "Payments", description: "Payment provider (mock/razorpay), webhook" },
    { name: "Admin", description: "Admin auth (separate JWT), dashboard, user/property/business/category/plan/notification management" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Access token from POST /api/auth/verify-otp. Paste it as `Bearer <token>` (with the word Bearer and a space).",
      },
      adminBearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Admin access token from POST /api/admin/auth/login — a DIFFERENT secret than the user-app token. User tokens are never accepted on admin routes.",
      },
    },
    schemas: {
      SuccessEnvelope: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {},
        },
      },
      ErrorEnvelope: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "VALIDATION_ERROR" },
              message: { type: "string" },
            },
          },
        },
      },
      UserProfile: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", nullable: true },
          mobile: { type: "string" },
          email: { type: "string", nullable: true },
          profileImage: { type: "string", nullable: true },
          language: { type: "string", default: "en" },
          accountStatus: { type: "string", enum: ["ACTIVE", "DEACTIVATED", "DELETED"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Notification: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          message: { type: "string" },
          type: {
            type: "string",
            enum: ["BUSINESS_VERIFICATION", "PROPERTY_VERIFICATION", "SUBSCRIPTION", "SYSTEM", "ADMIN"],
          },
          readStatus: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
};
