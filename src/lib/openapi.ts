import swaggerJsdoc from "swagger-jsdoc";
import definition from "../../scripts/openapi.definition.cjs";

let cachedSpec: unknown | null = null;

/**
 * Builds the OpenAPI spec from the shared definition + @swagger JSDoc
 * annotations in every route handler under src/app/api.
 */
export function getOpenApiSpec(): unknown {
  if (!cachedSpec) {
    cachedSpec = swaggerJsdoc({
      definition,
      apis: [`${process.cwd()}/src/app/api/**/route.ts`],
    });
  }
  return cachedSpec;
}
