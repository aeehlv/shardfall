import { betterAuth } from "better-auth";
import { db } from "./server/db";

/** better-auth server config — email+password, SQLite (dev). */
export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 6,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
  },
  trustedOrigins: ["http://localhost:3000", "http://localhost:3800", "http://localhost:3001", "http://192.168.178.20:3800", "http://192.168.178.20:3000", "http://192.168.178.20:3001", "http://10.5.0.2:3800", "http://10.5.0.2:3000", "http://10.5.0.2:3001", "http://192.168.178.*"],
});
