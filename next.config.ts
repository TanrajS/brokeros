import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Documents (v1.4) upload through a server action: allow the 10 MB cap plus form overhead.
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  // The certificate PDF renderer runs in Node and is not bundled.
  serverExternalPackages: ["@react-pdf/renderer"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
