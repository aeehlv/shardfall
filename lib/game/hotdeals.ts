/** Hot pack deals on the main menu — three staggered 24h cycles (offset 8h), deterministic. */

import { PACKS } from "./packs";

export interface HotDeal {
  slot: number;
  pack: (typeof PACKS)[number];
  discountPct: number;
  price: number;
  endsAt: number;
}

const DAY = 86_400_000;
const OFFSET = DAY / 3; // 8h stagger

export function getHotDeals(now = Date.now()): HotDeal[] {
  return [0, 1, 2].map((i) => {
    const cycle = Math.floor((now - i * OFFSET) / DAY);
    const endsAt = (cycle + 1) * DAY + i * OFFSET;
    const pack = PACKS[(cycle + i) % PACKS.length];
    const discountPct = [25, 30, 40][i];
    return {
      slot: i, pack, discountPct,
      price: Math.round(pack.gold * (1 - discountPct / 100)),
      endsAt,
    };
  });
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}
