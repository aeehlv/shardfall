"use client";

/** Shardfall ACCOUNT — identity, progression, wallet, and the purchase ledger. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient, newPasswordIssue } from "@/lib/auth-client";
import { usePlayer } from "@/lib/player-context";
import SiteFooter from "@/components/SiteFooter";
import "@/app/menu.css";
import "./account.css";

/** Mirrors a ledger row of GET /api/me/transactions. */
interface Txn {
  ts: number;
  kind: string;
  currency: "gold" | "shards" | null;
  amount: number;
  itemId?: string;
  balanceAfter?: number;
}

const KIND_LABEL: Record<string, string> = {
  match_reward: "Match reward",
  campaign_reward: "Campaign reward",
  pack_open: "Pack opened",
  pack_purchase: "Pack purchase",
  single_purchase: "Card purchase",
  rotation_purchase: "Rotation purchase",
  hot_deal: "Hot deal",
  daily_free: "Daily free card",
  topup_demo: "Demo top-up",
  demo_grant: "Demo grant",
  practice_reward: "Practice reward",
  guest_import: "Guest progress import",
  admin_grant: "Admin grant",
};

const kindLabel = (kind: string) =>
  KIND_LABEL[kind] ?? kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Ledger kinds whose itemId is a pack, and kinds whose itemId is a card id. */
const PACK_KINDS = new Set(["pack_purchase", "pack_open", "hot_deal"]);
const CARD_KINDS = new Set(["single_purchase", "rotation_purchase", "daily_free"]);

/* eslint-disable @next/next/no-img-element */
/** Small artwork for a ledger row: card art, pack, or the currency coin. */
function TxnThumb({ txn }: { txn: Txn }) {
  if (PACK_KINDS.has(txn.kind)) {
    return <img className="txnThumb" src="/ui/pack.png" alt="" />;
  }
  if (txn.itemId && CARD_KINDS.has(txn.kind)) {
    return (
      <img
        className="txnThumb card"
        src={`/cards/art/game/${txn.itemId}.jpg`}
        alt=""
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
    );
  }
  if (txn.currency) {
    return <img className="txnThumb coin" src={txn.currency === "gold" ? "/ui/gold.png" : "/ui/shard.png"} alt="" />;
  }
  return null;
}
/* eslint-enable @next/next/no-img-element */

export default function AccountPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { signedIn, player, refresh } = usePlayer();

  // rename
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);

  // change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  // ledger
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [txnError, setTxnError] = useState<string | null>(null);

  // delete account
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/me/transactions?limit=100", { cache: "no-store" });
        if (!r.ok) { if (!cancelled) setTxnError(`History unavailable (${r.status})`); return; }
        const j = (await r.json()) as { transactions?: Txn[] };
        if (!cancelled) setTxns(j.transactions ?? []);
      } catch {
        if (!cancelled) setTxnError("History unavailable — check your connection");
      }
    })();
    return () => { cancelled = true; };
  }, [signedIn]);

  const startRename = () => {
    setNameDraft(session?.user.name ?? player?.name ?? "");
    setNameError(null);
    setEditingName(true);
  };

  const saveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nameBusy) return;
    const duelist = nameDraft.trim();
    if (duelist.length < 3 || duelist.length > 20) {
      setNameError("Duelist name must be 3–20 characters.");
      return;
    }
    setNameBusy(true);
    try {
      const { error: err } = await authClient.updateUser({ name: duelist });
      if (err) { setNameError(err.message ?? "Rename failed."); return; }
      setEditingName(false);
      await refresh();
    } finally {
      setNameBusy(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwBusy) return;
    setPwError(null);
    setPwDone(false);
    const pwIssue = newPasswordIssue(newPassword);
    if (pwIssue) {
      setPwError(pwIssue);
      return;
    }
    setPwBusy(true);
    try {
      const { error: err } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (err) { setPwError(err.message ?? "Password change failed."); return; }
      setCurrentPassword("");
      setNewPassword("");
      setPwDone(true);
    } finally {
      setPwBusy(false);
    }
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  const openDelete = () => {
    setDeletePassword("");
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const { error: err } = await authClient.deleteUser({ password: deletePassword });
      if (err) { setDeleteError(err.message ?? "Deletion failed — check your password."); return; }
      await authClient.signOut().catch(() => {});
      window.location.href = "/";
    } finally {
      setDeleteBusy(false);
    }
  };

  if (sessionPending) {
    return (
      <main className="accountMain" data-testid="account-page">
        <p className="acctPending">Consulting the shards…</p>
      </main>
    );
  }

  /* eslint-disable @next/next/no-img-element */
  if (!session?.user) {
    return (
      <main className="accountMain" data-testid="account-page">
        <Link className="accountBack" href="/">← Menu</Link>
        <section className="acctGate">
          <img src="/ui/emblem.png" alt="" />
          <h1>Your Account</h1>
          <p>Sign in to see your duelist profile, wallet, and purchase history — or forge a new account to keep your collection safe.</p>
          <Link className="acctGold" href="/login" data-testid="account-login">Sign in · Register</Link>
        </section>
        <SiteFooter />
      </main>
    );
  }

  const memberSince = session.user.createdAt
    ? new Date(session.user.createdAt).toLocaleDateString()
    : "—";
  const uniqueCards = player ? Object.keys(player.collection).length : 0;
  const totalCopies = player ? Object.values(player.collection).reduce((a, b) => a + b, 0) : 0;
  const unopenedPacks = player ? Object.values(player.packs).reduce((a, b) => a + b, 0) : 0;

  return (
    <main className="accountMain" data-testid="account-page">
      <Link className="accountBack" href="/" data-testid="account-back">← Menu</Link>

      <div className="accountCol">
        <header className="accountHeader">
          <h1>Account</h1>
          <p>Your duelist record in Kelvarrow</p>
        </header>

        {/* ---- identity ---- */}
        <section className="accountSection" data-testid="account-identity">
          <h2>Identity</h2>
          <div className="acctPanel">
            <div className="acctRow">
              <span>Duelist name</span>
              {!editingName ? (
                <>
                  <b data-testid="account-name">{session.user.name || player?.name}</b>
                  <button className="acctEdit" data-testid="account-rename" onClick={startRename}>
                    Rename
                  </button>
                </>
              ) : (
                <form className="acctForm inline" onSubmit={saveRename}>
                  <input
                    data-testid="account-name-input"
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    minLength={3}
                    maxLength={20}
                    autoFocus
                    required
                  />
                  <button className="acctGold" data-testid="account-name-save" type="submit" disabled={nameBusy}>
                    {nameBusy ? "Saving…" : "Save"}
                  </button>
                  <button className="acctDark" type="button" onClick={() => setEditingName(false)}>
                    Cancel
                  </button>
                </form>
              )}
            </div>
            {nameError && <p className="acctError" data-testid="account-name-error">{nameError}</p>}
            <div className="acctRow">
              <span>Email</span>
              <span className="acctValue">{session.user.email}</span>
            </div>
            <div className="acctRow">
              <span>Member since</span>
              <span className="acctValue">{memberSince}</span>
            </div>
          </div>
        </section>

        {/* ---- change password ---- */}
        <section className="accountSection">
          <h2>Change Password</h2>
          <div className="acctPanel">
            <form className="acctForm" onSubmit={changePassword}>
              <div className="acctFieldRow">
                <label className="acctField">
                  <span>Current password</span>
                  <input
                    data-testid="account-pw-current"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="acctField">
                  <span>New password</span>
                  <input
                    data-testid="account-pw-new"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="8+ characters, letters and numbers"
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </label>
              </div>
              {pwError && <p className="acctError" data-testid="account-pw-error">{pwError}</p>}
              {pwDone && <p className="acctOk" data-testid="account-pw-done">Password changed — other sessions were signed out.</p>}
              <div>
                <button className="acctGold" data-testid="account-pw-save" type="submit" disabled={pwBusy}>
                  {pwBusy ? "Working…" : "Change password"}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* ---- progression ---- */}
        <section className="accountSection" data-testid="account-progression">
          <h2>Progression</h2>
          <div className="acctStats">
            <div className="acctStat">
              <span>Level</span>
              <b><img src="/ui/emblem.png" alt="" />{player?.level ?? "·"}</b>
              <i>{player ? `${player.xp} XP` : "…"}</i>
            </div>
            <div className="acctStat">
              <span>League</span>
              {player ? (
                <b className={`leagueTag l-${player.league}`}>
                  <img className="leagueCrest" src={`/ui/leagues/${player.league.toLowerCase()}.png`} alt="" />
                  {player.league}
                </b>
              ) : (
                <b>·</b>
              )}
              <i>{player ? `${player.rating} rating` : "…"}</i>
            </div>
            <div className="acctStat">
              <span>Record</span>
              <b>{player ? `${player.wins}W · ${player.losses}L` : "·"}</b>
              <i>ranked & practice</i>
            </div>
          </div>
        </section>

        {/* ---- wallet & assets ---- */}
        <section className="accountSection" data-testid="account-wallet">
          <h2>Wallet &amp; Assets</h2>
          <div className="acctStats">
            <div className="acctStat">
              <span>Gold</span>
              <b><img src="/ui/gold.png" alt="gold" />{player?.gold ?? "·"}</b>
            </div>
            <div className="acctStat">
              <span>Aethershards</span>
              <b><img src="/ui/shard.png" alt="shards" />{player?.shards ?? "·"}</b>
            </div>
            <div className="acctStat">
              <span>Unopened packs</span>
              <b><img src="/ui/pack.png" alt="" />{player ? unopenedPacks : "·"}</b>
            </div>
            <div className="acctStat">
              <span>Collection</span>
              <b><img className="acctIconWide" src="/ui/cards-fan.png" alt="" />{player ? uniqueCards : "·"}</b>
              <i>{player ? `${totalCopies} total copies` : "…"}</i>
            </div>
          </div>
        </section>

        {/* ---- purchase history ---- */}
        <section className="accountSection" data-testid="account-history">
          <h2>Purchase History</h2>
          <div className="acctPanel">
            {txnError ? (
              <p className="txnEmpty">{txnError}</p>
            ) : txns === null ? (
              <p className="txnEmpty">Unrolling the ledger…</p>
            ) : txns.length === 0 ? (
              <p className="txnEmpty">No transactions yet — the ledger fills as you play and trade.</p>
            ) : (
              <div className="txnWrap">
                <table className="txnTable" data-testid="txn-table">
                  <thead>
                    <tr>
                      <th className="txnThumbCell" aria-label="Artwork" />
                      <th>Date</th>
                      <th>Type</th>
                      <th>Item</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t, i) => (
                      <tr key={`${t.ts}-${i}`}>
                        <td className="txnThumbCell"><TxnThumb txn={t} /></td>
                        <td className="txnDate">{new Date(t.ts).toLocaleString()}</td>
                        <td className="txnKind">{kindLabel(t.kind)}</td>
                        <td className="txnItem">{t.itemId ?? "—"}</td>
                        <td className={`txnAmount ${t.currency === null || t.amount === 0 ? "txnZero" : t.amount > 0 ? "txnPlus" : "txnMinus"}`}>
                          {t.currency === null ? (
                            "—"
                          ) : (
                            <>
                              {t.amount > 0 ? `+${t.amount}` : t.amount}
                              <img
                                src={t.currency === "gold" ? "/ui/gold.png" : "/ui/shard.png"}
                                alt={t.currency}
                              />
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <div className="acctSignoutRow">
          <button className="acctDark" data-testid="account-signout" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>

        {/* ---- danger zone ---- */}
        <section className="accountSection acctDanger" data-testid="account-danger">
          <h2>Danger Zone</h2>
          <div className="acctPanel acctDangerPanel">
            {!deleteOpen ? (
              <div className="acctDangerRow">
                <p>
                  Delete this account and every trace of it — collection, decks, wallet,
                  and ledger. This cannot be undone.
                </p>
                <button className="acctDangerBtn" data-testid="account-delete" onClick={openDelete}>
                  Delete account
                </button>
              </div>
            ) : (
              <form className="acctForm" onSubmit={deleteAccount}>
                <p className="acctDangerWarn">
                  Last warning: your duelist will be erased forever. Enter your password to confirm.
                </p>
                <div className="acctFieldRow">
                  <label className="acctField">
                    <span>Password</span>
                    <input
                      data-testid="account-delete-password"
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      autoComplete="current-password"
                      autoFocus
                      required
                    />
                  </label>
                </div>
                {deleteError && <p className="acctError" data-testid="account-delete-error">{deleteError}</p>}
                <div className="acctDangerActions">
                  <button
                    className="acctDangerBtn confirm"
                    data-testid="account-delete-confirm"
                    type="submit"
                    disabled={deleteBusy}
                  >
                    {deleteBusy ? "Erasing…" : "Erase my account forever"}
                  </button>
                  <button className="acctDark" type="button" onClick={() => setDeleteOpen(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
  /* eslint-enable @next/next/no-img-element */
}
