"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import SiteFooter from "@/components/SiteFooter";
import "./login.css";

export default function LoginPage() {
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // magic link: email the link went to (null = email form), resend cooldown in seconds
  const [magicSent, setMagicSent] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendMagicLink = async () => {
    if (busy || cooldown > 0) return;
    setError(null);
    const to = email.trim();
    if (!to.includes("@")) {
      setError("Enter your email to receive a sign-in link.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await authClient.signIn.magicLink({ email: to, callbackURL: "/" });
      if (err) {
        setError(err.message ?? "Could not send the sign-in link.");
        return;
      }
      setMagicSent(to);
      setCooldown(30);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMagicLink();
  };

  const useDifferentEmail = () => {
    setMagicSent(null);
    setError(null);
    setCooldown(0);
  };

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await authClient.signOut();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="loginMain">
      <div className="loginBackdrop" aria-hidden="true" />
      <Link className="loginBack" href="/">← Menu</Link>

      <section className="loginPanel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="loginLogo" src="/ui/logo-epic.png" alt="Shardfall" />

        {isPending ? (
          <p className="loginPending">Consulting the shards…</p>
        ) : session?.user ? (
          <div className="loginSession">
            <p className="loginSignedIn" data-testid="signed-in">
              Signed in as <b>{session.user.name}</b>
            </p>
            <button
              className="loginSubmit"
              data-testid="auth-signout"
              onClick={signOut}
              disabled={busy}
            >
              Sign out
            </button>
            <Link className="loginGhost" href="/">Back to menu</Link>
          </div>
        ) : magicSent ? (
          <div className="loginSession" data-testid="auth-magic-sent">
            <p className="loginSignedIn">
              Check your inbox — a sign-in link is on its way to <b>{magicSent}</b>.
            </p>
            <p className="loginNote">
              The link signs you in directly and expires after a few minutes.
            </p>
            {error && (
              <p className="authError" data-testid="auth-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="loginSubmit"
              data-testid="auth-magic-resend"
              type="button"
              onClick={() => void sendMagicLink()}
              disabled={busy || cooldown > 0}
            >
              {cooldown > 0
                ? `Resend link (${cooldown}s)`
                : busy
                  ? "Sending…"
                  : "Resend link"}
            </button>
            <button className="loginGhost" type="button" onClick={useDifferentEmail}>
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <form className="loginForm" onSubmit={submit}>
              <h1 className="loginSignedIn">Sign in with email</h1>

              <label className="loginField">
                <span>Email</span>
                <input
                  data-testid="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>

              {error && (
                <p className="authError" data-testid="auth-error" role="alert">
                  {error}
                </p>
              )}

              <button
                className="loginSubmit"
                data-testid="auth-submit"
                type="submit"
                disabled={busy}
              >
                {busy ? "Sending…" : "Enter Kelvarrow"}
              </button>
            </form>

            <p className="loginNote">
              No passwords — we email you a one-time sign-in link. First time here?
              The link creates your account automatically.
            </p>
          </>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}
