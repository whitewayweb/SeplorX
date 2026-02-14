import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Ensure we don't try to use node modules in the edge runtime accidentally
  serverExternalPackages: ['mysql2', 'bcryptjs'],
};

export default nextConfig;
