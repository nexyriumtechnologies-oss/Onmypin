import swaggerJsdoc from "swagger-jsdoc";
import definition from "../../scripts/openapi.definition.cjs";

let cachedSpec: unknown | null = null;

/**
 * Builds the OpenAPI spec from the shared definition + @swagger JSDoc
 * annotations in every public and admin route handler.
 */
export function getOpenApiSpec(): unknown {
  if (!cachedSpec) {
    cachedSpec = swaggerJsdoc({
      definition,
      apis: [
        `${process.cwd()}/src/app/api/**/route.ts`,
        `${process.cwd()}/src/app/admin/**/route.ts`,
      ],
    });
  }
  return cachedSpec;
}
