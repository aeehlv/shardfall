"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

/** Password policy for NEW passwords (signup + change); existing ones are unaffected.
 *  Returns a user-facing problem description, or null when the password passes. */
export function newPasswordIssue(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one letter and one digit.";
  }
  return null;
}
