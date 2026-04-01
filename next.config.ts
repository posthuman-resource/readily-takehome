import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sqlite-vec", "@sqliteai/sqlite-vector"],
};

export default nextConfig;
