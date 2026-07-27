"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import "./login.css";

type Tab = "signin" | "signup";

/** Best-effort import of the local guest profile into the fresh account. */
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

  const switchTab = (t: Tab) => {
    setTab(t);
    setError(null);
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
    }

    setBusy(true);
    try {
      if (tab === "signin") {
        const { error: err } = await authClient.signIn.email({ email, password });
        if (err) {
          setError(err.message ?? "Sign in failed.");
          return;
        }
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
        <h1 className="loginTitle">Shardfall</h1>
        <p className="loginSub">The shards remember every duelist.</p>

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
                  placeholder="At least 6 characters"
                  minLength={6}
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
            </form>

            <p className="loginNote">
              {tab === "signup"
                ? "Your local progress is carried into the new account."
                : "New to Kelvarrow? Create an account to keep your collection."}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
