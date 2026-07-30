"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient, newPasswordIssue } from "@/lib/auth-client";
import SiteFooter from "@/components/SiteFooter";
import "./login.css";

type Tab = "signin" | "signup";

/** Best-effort import of the local guest profile into the account (server-side idempotent). */
async function importGuestProfile() {
  try {
    const raw = localStorage.getItem("shardfall-profile-v1") ?? "{}";
    const body = JSON.stringify(JSON.parse(raw));
    await fetch("/api/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch {
    // ignore — the account still works without imported progress
  }
}

export default function LoginPage() {
  const { data: session, isPending } = authClient.useSession();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // magic link: email the link went to (null = password form), resend cooldown in seconds
  const [magicSent, setMagicSent] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setError(null);
    setMagicSent(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (tab === "signup") {
      const duelist = name.trim();
      if (duelist.length < 3 || duelist.length > 20) {
        setError("Duelist name must be 3–20 characters.");
        return;
      }
      const pwIssue = newPasswordIssue(password);
      if (pwIssue) {
        setError(pwIssue);
        return;
      }
    }

    setBusy(true);
    try {
      if (tab === "signin") {
        const { error: err } = await authClient.signIn.email({ email, password });
        if (err) {
          setError(err.message ?? "Sign in failed.");
          return;
        }
        await importGuestProfile();
      } else {
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: name.trim(),
        });
        if (err) {
          setError(err.message ?? "Could not create the account.");
          return;
        }
        await importGuestProfile();
      }
      window.location.href = "/";
    } finally {
      setBusy(false);
    }
  };

  const sendMagicLink = async () => {
    if (busy || cooldown > 0) return;
    setError(null);
    const to = email.trim();
    if (!to.includes("@")) {
      setError("Enter your email above to receive a sign-in link.");
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
        ) : (
          <>
            <div className="loginTabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "signin"}
                className={`loginTab${tab === "signin" ? " active" : ""}`}
                data-testid="tab-signin"
                onClick={() => switchTab("signin")}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "signup"}
                className={`loginTab${tab === "signup" ? " active" : ""}`}
                data-testid="tab-signup"
                onClick={() => switchTab("signup")}
              >
                Create account
              </button>
            </div>

            {magicSent ? (
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
                <button className="loginGhost" type="button" onClick={() => setMagicSent(null)}>
                  Use a password instead
                </button>
              </div>
            ) : (
              <form className="loginForm" onSubmit={submit}>
                {tab === "signup" && (
                  <label className="loginField">
                    <span>Duelist name</span>
                    <input
                      data-testid="auth-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="3–20 characters"
                      minLength={3}
                      maxLength={20}
                      autoComplete="nickname"
                      required
                    />
                  </label>
                )}

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

                <label className="loginField">
                  <span>Password</span>
                  <input
                    data-testid="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={tab === "signin" ? "Your password" : "8+ characters, letters and numbers"}
                    minLength={tab === "signin" ? 6 : 8}
                    autoComplete={tab === "signin" ? "current-password" : "new-password"}
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
                  {busy ? "Working…" : tab === "signin" ? "Sign in" : "Create account"}
                </button>

                {tab === "signin" && (
                  <button
                    className="loginGhost"
                    data-testid="auth-magic"
                    type="button"
                    onClick={() => void sendMagicLink()}
                    disabled={busy}
                  >
                    Send me a sign-in link
                  </button>
                )}
              </form>
            )}

            <p className="loginNote">
              {tab === "signup"
                ? "Your local progress is carried into the new account."
                : "New to Kelvarrow? Create an account to keep your collection."}
            </p>
          </>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}
