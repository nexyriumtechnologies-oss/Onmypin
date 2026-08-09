const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OwnMyPin API — Swagger UI</title>
  <link rel="stylesheet" href="/api/docs/assets/swagger-ui.css" />
</head>
<body style="margin: 0">
  <div id="swagger-ui"></div>
  <script src="/api/docs/assets/swagger-ui-bundle.js"></script>
  <script src="/api/docs/assets/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        persistAuthorization: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "BaseLayout",
      });
    };
  </script>
</body>
</html>`;

/** GET /api/docs — interactive Swagger UI for every Phase 1 endpoint. */
export async function GET() {
  return new Response(PAGE, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
