import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Amazon SP-API SDK uses node:fs and other Node built-ins that
  // Webpack/Turbopack cannot bundle. Mark it as a server-side external
  // so it is required() at runtime instead of being bundled.
  serverExternalPackages: ["@amazon-sp-api-release/amazon-sp-api-sdk-js"],
};

export default nextConfig;
