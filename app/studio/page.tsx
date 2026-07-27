"use client";

import { useEffect, useState } from "react";
import "./studio.css";

interface Slot {
  id: string;
  label: string;
  kind: "art" | "frame" | "image";
  url: string;
  prompt: string;
}

/** selected === -1 → the saved current file; otherwise an index into versions */
export default function Studio() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [sel, setSel] = useState<Slot | null>(null);
  const [prompt, setPrompt] = useState("");
  const [useBase, setUseBase] = useState(true);
  const [versions, setVersions] = useState<string[]>([]);
  const [selected, setSelected] = useState(-1);
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [bust, setBust] = useState(0);

  useEffect(() => {
    fetch("/api/studio/slots")
      .then((r) => r.json())
      .then((d) => {
        setSlots(d.slots);
        if (d.slots.length) pick(d.slots[0]);
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (s: Slot) => {
    setSel(s);
    setPrompt(s.prompt);
    setVersions([]);
    setSelected(-1);
    setError(null);
    setSavedMsg(null);
  };

  const generate = async () => {
    if (!sel) return;
    setBusy("generate");
    setError(null);
    setSavedMsg(null);
    try {
      const r = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: sel.id,
          prompt,
          useBase,
          baseImage: useBase && selected >= 0 ? versions[selected] : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? r.statusText);
      setVersions((v) => {
        setSelected(v.length);
        return [...v, d.image];
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!sel || selected < 0) return;
    setBusy("save");
    setError(null);
    try {
      const r = await fetch("/api/studio/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: sel.id, image: versions[selected] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? r.statusText);
      setSavedMsg(
        `V${selected + 1} saved to ${d.saved} (previous version backed up). Refresh the gallery to see it live.`,
      );
      setBust(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const baseLabel = selected >= 0 ? `V${selected + 1}` : "Current";

  /* eslint-disable @next/next/no-img-element */
  return (
    <main className="studioMain">
      <aside className="slotRail">
        <h1>Card Studio</h1>
        <p className="sub">
          Pick an asset, adjust the prompt, regenerate with gemini-3.1-flash-image (~$0.07 per
          generation), then save. Generations stack as versions — iterate on any of them.
        </p>
        {slots.map((s) => (
          <button key={s.id} className={`slotBtn${sel?.id === s.id ? " active" : ""}`} onClick={() => pick(s)}>
            <img src={`${s.url}?v=${bust}`} alt="" />
            <span>
              {s.label}
              <span className="kind">{s.kind}</span>
            </span>
          </button>
        ))}
      </aside>

      <section className="workArea">
        {sel && (
          <>
            <h2>{sel.label}</h2>

            <div className="versionStrip">
              <button
                className={`verChip${selected === -1 ? " active" : ""}`}
                onClick={() => setSelected(-1)}
                title="The saved file"
              >
                <img src={`${sel.url}?v=${bust}`} alt="" />
                <span>Current</span>
              </button>
              {versions.map((v, i) => (
                <button
                  key={i}
                  className={`verChip${selected === i ? " active" : ""}`}
                  onClick={() => setSelected(i)}
                  title={`Generated version ${i + 1}`}
                >
                  <img src={v} alt="" />
                  <span>V{i + 1}</span>
                </button>
              ))}
              {busy === "generate" && <span className="verPending">generating…</span>}
            </div>

            <div className="compare">
              <div className="pane">
                <div className="paneLabel">Current (saved file)</div>
                <img src={`${sel.url}?v=${bust}`} alt={`Current ${sel.label}`} />
              </div>
              <div className="pane">
                <div className="paneLabel">
                  {selected >= 0 ? `Selected — V${selected + 1}` : "Selected — none yet"}
                </div>
                {selected >= 0 ? (
                  <img src={versions[selected]} alt={`Version ${selected + 1}`} />
                ) : (
                  <div className="empty">
                    {busy === "generate" ? "Generating… (10–40s)" : "Generate to create V1"}
                  </div>
                )}
              </div>
            </div>

            <textarea
              className="promptBox"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image or the edit…"
            />

            <div className="controls">
              <label>
                <input type="checkbox" checked={useBase} onChange={(e) => setUseBase(e.target.checked)} />
                Edit {baseLabel} (uncheck to generate from scratch)
              </label>
              <button className="btn primary" onClick={generate} disabled={busy !== null || !prompt.trim()}>
                {busy === "generate" ? "Generating…" : `Generate${useBase ? ` from ${baseLabel}` : ""}`}
              </button>
              <button className="btn" onClick={save} disabled={busy !== null || selected < 0}>
                {busy === "save" ? "Saving…" : selected >= 0 ? `Save V${selected + 1} as current` : "Save as current"}
              </button>
              <a className="hintLine" href="/">
                ← back to gallery
              </a>
            </div>
            {sel.kind === "frame" && (
              <p className="hintLine">
                Frame saves automatically knock the black portrait window out to transparency. If a new
                frame moves its banner or window, tell Claude to re-measure the text positions.
              </p>
            )}
            {sel.kind === "art" && (
              <p className="hintLine">
                Art displays with cover-crop inside this card&apos;s window — generate roughly the same
                aspect as the current image for predictable framing.
              </p>
            )}
            {error && <div className="err">{error}</div>}
            {savedMsg && <div className="okMsg">{savedMsg}</div>}
          </>
        )}
      </section>
    </main>
  );
  /* eslint-enable @next/next/no-img-element */
}
