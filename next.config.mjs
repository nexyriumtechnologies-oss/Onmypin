/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // swagger-jsdoc uses Node.js fs + glob to scan source files at runtime.
  // Keeping it external prevents Next.js from bundling it, which also avoids
  // a build-time "<Html> outside of _document" false-positive from its deps.
  serverExternalPackages: ["swagger-jsdoc"],
};

export default nextConfig;
