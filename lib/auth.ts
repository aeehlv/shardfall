import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { getDbSync, getMongoClient } from "./server/db";

/** Local dev + LAN origins that must keep working alongside the deployed ones. */
const LOCAL_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3800",
  "http://localhost:3001",
  "http://192.168.178.20:3800",
  "http://192.168.178.20:3000",
  "http://192.168.178.20:3001",
  "http://10.5.0.2:3800",
  "http://10.5.0.2:3000",
  "http://10.5.0.2:3001",
  "http://192.168.178.*",
];

/** LOCAL_ORIGINS + BETTER_AUTH_URL + comma-separated TRUSTED_ORIGINS + Vercel previews. */
function trustedOrigins(): string[] {
  const extra = (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
  return [
    ...new Set(
      [
        ...LOCAL_ORIGINS,
        (process.env.BETTER_AUTH_URL ?? "").trim(),
        vercelUrl,
        ...extra,
        "https://*.vercel.app",
      ].filter(Boolean),
    ),
  ];
}

/** Built lazily so importing this module never requires a live MONGODB_URI at build time. */
const database: ReturnType<typeof mongodbAdapter> = (options) =>
  mongodbAdapter(getDbSync(), { client: getMongoClient() })(options);

/** better-auth server config — email+password on MongoDB (Atlas). */
export const auth = betterAuth({
  database,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 6,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
  },
  trustedOrigins: trustedOrigins(),
});
