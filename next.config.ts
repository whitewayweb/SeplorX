import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Packages that use Node.js built-ins (node:fs, node:crypto, etc.) cannot be
  // bundled by Webpack/Turbopack. Mark them as server-side externals so they
  // are required() at runtime instead, avoiding cold-start compilation hangs.
  serverExternalPackages: [
    "@ai-sdk/google",
    "ai",
  ],
};

export default nextConfig;
