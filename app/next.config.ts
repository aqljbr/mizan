import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pptxgenjs"],
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
};

export default nextConfig;
