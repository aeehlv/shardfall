import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The MongoDB driver must stay a real Node require (optional native deps, dynamic loads).
  serverExternalPackages: ["mongodb"],
  allowedDevOrigins: ["192.168.178.20", "10.5.0.2", "192.168.178.*"],
  /* config options here */
};

export default nextConfig;
