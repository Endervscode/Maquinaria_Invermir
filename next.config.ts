import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Cloudflare Pages
  output: "export",

  // SPA-friendly trailing slash
  trailingSlash: true,

  // Disable image optimization (requires server)
  images: {
    unoptimized: true,
  },

  // Skip type errors during build (project uses loose TS)
  typescript: {
    ignoreBuildErrors: true,
  },

  // React strict mode off for legacy compatibility
  reactStrictMode: false,
};

export default nextConfig;
