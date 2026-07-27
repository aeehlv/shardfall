import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["192.168.178.20", "10.5.0.2", "192.168.178.*"],
  /* config options here */
};

export default nextConfig;
