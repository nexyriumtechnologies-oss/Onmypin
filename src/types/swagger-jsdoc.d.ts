declare module "swagger-jsdoc" {
  interface SwaggerJsdocOptions {
    definition?: Record<string, unknown>;
    apis?: string[];
  }
  function swaggerJsdoc(options: SwaggerJsdocOptions): unknown;
  export default swaggerJsdoc;
}
