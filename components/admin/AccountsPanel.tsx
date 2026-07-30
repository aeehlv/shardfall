"use client";

/** Manual account creation: makes a passwordless better-auth user (verified by
 *  default) plus their player row via POST /api/admin/accounts. The client then
 *  signs in with a magic link — no password ever exists. */

import { useState } from "react";

export default function AccountsPanel({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [verified, setVerified] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const create = async () => {
    if (!email.trim()) {
      setNote({ ok: false, text: "Enter an email first." });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          ...(name.trim() ? { name: name.trim() } : {}),
          verified,
        }),
      });
      const json = (await res.json()) as { playerId?: number; error?: string };
      if (!res.ok || !json.playerId) throw new Error(json.error || `status ${res.status}`);
      setNote({ ok: true, text: `Account created — player #${json.playerId}. They sign in by magic link.` });
      setEmail("");
      setName("");
      setVerified(true);
      onCreated();
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "Creation failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admPanel admAccounts" data-testid="admin-accounts">
      <h3>Create account</h3>
      <p className="admMmHint">Adds a client manually — active immediately; they enter with a magic link to this email.</p>
      <div className="admAccountsRow">
        <label className="admGrantField admAccountsField">
          <span>Email</span>
          <input
            type="email" value={email} placeholder="client@example.com"
            data-testid="admin-account-email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="admGrantField admAccountsField">
          <span>Name</span>
          <input
            type="text" maxLength={24} value={name} placeholder="Duelist name (optional)"
            data-testid="admin-account-name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="admAccountsCheck">
          <input
            type="checkbox" checked={verified}
            data-testid="admin-account-verified"
            onChange={(e) => setVerified(e.target.checked)}
          />
          <span>Verified</span>
        </label>
        <button
          className="admGrantBtn admAccountsBtn" disabled={busy}
          data-testid="admin-account-create"
          onClick={() => void create()}
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
      {note && <p className={`admGrantNote${note.ok ? " ok" : ""}`}>{note.text}</p>}
    </section>
  );
}
