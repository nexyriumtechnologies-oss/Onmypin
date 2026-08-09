/**
 * Generates the OpenAPI spec from the same source the server uses and exports
 * it as a Postman collection.
 *
 * Usage: npm run export:postman
 * Output: postman/ownmypin.postman_collection.json
 *
 * No server needed — the spec is built directly from the @swagger JSDoc
 * annotations in the route files under src/app/api.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const swaggerJsdoc = require("swagger-jsdoc");
const { convert } = require("openapi-to-postmanv2");
const definition = require("./openapi.definition.cjs");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const spec = swaggerJsdoc({
  definition,
  apis: [`${root}/src/app/api/**/route.ts`],
});

convert(
  { type: "string", data: JSON.stringify(spec) },
  { requestParametersResolution: "schema", exampleParametersResolution: "example", folderStrategy: "Tags" },
  (err, result) => {
    if (err || !result.result) {
      console.error("Postman conversion failed:", err ?? result.reason);
      process.exit(1);
    }
    const outDir = join(root, "postman");
    mkdirSync(outDir, { recursive: true });
    const outFile = join(outDir, "ownmypin.postman_collection.json");
    writeFileSync(outFile, JSON.stringify(result.output[0].data, null, 2));
    console.log(`Postman collection written to ${outFile}`);
    console.log("Import it in Postman via File > Import. Use the collection variables:");
    console.log("  baseUrl  = http://localhost:3000");
    console.log("  bearerToken = <access token from POST /api/auth/verify-otp>");
  },
);
