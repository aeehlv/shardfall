"use client";

/** Admin store-price editor: effective prices with sparse overrides on top
 *  (GET/POST /api/admin/pricing). Dirty fields are sent as a partial patch;
 *  "Clear overrides" resets every section to the shipped defaults. */

import { useEffect, useState } from "react";

type Catalog = {
  packs: { id: string; name: string; cards: number; gold: number }[];
  singles: Record<string, number>;
  topups: { shards: number; price: string; label?: string; best?: boolean }[];
};
type Overrides = {
  packs?: Record<string, number>;
  singles?: Record<string, number>;
  topups?: Record<string, number>;
};
type PricingDto = { effective: Catalog; overrides: Overrides };

/** "1.99 €" → "1.99" (topup inputs edit the numeric part only). */
const eurToInput = (price: string) => String(parseFloat(price) || "");

export default function PricingPanel() {
  const [data, setData] = useState<PricingDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const seed = (dto: PricingDto) => {
    const v: Record<string, string> = {};
    for (const p of dto.effective.packs) v[`packs.${p.id}`] = String(p.gold);
    for (const [r, price] of Object.entries(dto.effective.singles)) v[`singles.${r}`] = String(price);
    for (const t of dto.effective.topups) v[`topups.${t.shards}`] = eurToInput(t.price);
    setData(dto);
    setValues(v);
  };

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/admin/pricing", { cache: "no-store", signal: ctrl.signal });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const dto = (await res.json()) as PricingDto;
        if (!ctrl.signal.aborted) seed(dto);
      } catch {
        if (!ctrl.signal.aborted) setFailed(true);
      }
    })();
    return () => ctrl.abort();
  }, []);

  if (failed) return <p className="admEmpty">The price sheets could not be read.</p>;
  if (!data) return null;

  /** Patch of fields whose input no longer matches the loaded effective value. */
  const buildPatch = () => {
    const patch: Record<string, Record<string, number>> = {};
    const put = (section: string, key: string, raw: string, integer: boolean) => {
      const n = integer ? Math.trunc(Number(raw)) : Number(raw);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid price for ${key}`);
      (patch[section] ??= {})[key] = n;
    };
    for (const p of data.effective.packs) {
      const raw = values[`packs.${p.id}`];
      if (raw !== undefined && Number(raw) !== p.gold) put("packs", p.id, raw, true);
    }
    for (const [r, price] of Object.entries(data.effective.singles)) {
      const raw = values[`singles.${r}`];
      if (raw !== undefined && Number(raw) !== price) put("singles", r, raw, true);
    }
    for (const t of data.effective.topups) {
      const raw = values[`topups.${t.shards}`];
      if (raw !== undefined && Number(raw) !== parseFloat(t.price)) put("topups", String(t.shards), raw, false);
    }
    return patch;
  };

  const post = async (body: unknown, okText: string) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as PricingDto & { error?: string };
      if (!res.ok || !json.effective) throw new Error(json.error || `status ${res.status}`);
      seed(json);
      setNote({ ok: true, text: okText });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    let patch: Record<string, Record<string, number>>;
    try {
      patch = buildPatch();
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "Invalid price." });
      return;
    }
    if (Object.keys(patch).length === 0) {
      setNote({ ok: false, text: "Nothing changed." });
      return;
    }
    void post(patch, "Prices saved.");
  };

  const overridden = (section: keyof Overrides, key: string) =>
    data.overrides[section]?.[key] !== undefined;
  const field = (
    section: keyof Overrides, key: string, label: string, testid: string, step?: string,
  ) => (
    <label className="admGrantField admPriceField" key={`${section}.${key}`}>
      <span>
        {label}
        {overridden(section, key) && <i className="admPriceDot" title="Overridden" />}
      </span>
      <input
        type="number" min={0} step={step ?? 1} inputMode="decimal"
        value={values[`${section}.${key}`] ?? ""}
        data-testid={testid}
        onChange={(e) => setValues((v) => ({ ...v, [`${section}.${key}`]: e.target.value }))}
      />
    </label>
  );

  return (
    <section className="admPanel admPricing" data-testid="admin-pricing">
      <h3>Store prices</h3>
      <p className="admMmHint">What the store charges — changes apply within seconds. Values in gold, Aethershards, and € (top-ups are display-only for now).</p>
      <div className="admPricingCols">
        <div className="admPricingCol">
          <h4>Packs · gold</h4>
          {data.effective.packs.map((p) => field("packs", p.id, p.name, `admin-price-pack-${p.id}`))}
        </div>
        <div className="admPricingCol">
          <h4>Singles · shards</h4>
          {Object.keys(data.effective.singles).map((r) =>
            field("singles", r, r, `admin-price-single-${r}`))}
        </div>
        <div className="admPricingCol">
          <h4>Top-ups · €</h4>
          {data.effective.topups.map((t) =>
            field("topups", String(t.shards), `${t.shards} shards`, `admin-price-topup-${t.shards}`, "0.01"))}
        </div>
      </div>
      <div className="admPricingActions">
        <button
          className="admGrantBtn admPricingSave" disabled={busy}
          data-testid="admin-pricing-save" onClick={save}
        >
          {busy ? "Saving…" : "Save prices"}
        </button>
        <button
          className="admPricingReset" disabled={busy}
          data-testid="admin-pricing-reset"
          onClick={() => void post({ packs: null, singles: null, topups: null }, "Overrides cleared — defaults restored.")}
        >
          Clear overrides
        </button>
      </div>
      {note && <p className={`admGrantNote${note.ok ? " ok" : ""}`}>{note.text}</p>}
    </section>
  );
}
