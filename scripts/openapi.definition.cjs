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
    version: "0.1.0",
    description:
      "OwnMyPin backend — Phase 1 (auth/OTP, users, properties, DigiPin, QR, location, media).\n\n" +
      "1. POST /api/auth/send-otp, then POST /api/auth/verify-otp to get tokens.\n" +
      "2. Click the green **Authorize** button, paste `Bearer <accessToken>`, and every protected route is unlocked.",
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
    },
  },
};
