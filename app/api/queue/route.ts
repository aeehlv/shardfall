import { NextResponse } from "next/server";
import type { Collection } from "mongodb";
import { sessionPlayer } from "@/lib/server/session";
import { playersCol, queueCol, type QueueDoc } from "@/lib/server/db";
import { activeMatchesFor, createMatch } from "@/lib/server/match";
import { getBotWaitMs } from "@/lib/server/settings";
import type { FactionId } from "@/lib/game/types";

export const dynamic = "force-dynamic";
// The client polls every 1.5s; a ticket whose heartbeat lapsed is unpairable, and
// anything silent for 10 minutes gets swept.
const BEAT_FRESH_MS = 30_000;
const TICKET_TTL_MS = 600_000;
// A claimer writes the real matchId within a request; a claim older than this belongs
// to a dead claimer and must not hold the ticket forever.
const CLAIM_TTL_MS = 10_000;

const factions: FactionId[] = ["pyre", "abyss", "verdant"];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** Placeholder matchId (`claimed:<pid>:<ts>`) while a poller holds the claim but hasn't created the match yet. */
const isClaim = (matchId: string | null | undefined) => !!matchId && matchId.startsWith("claimed:");

/** Claims from before the timestamp existed count as expired — nothing can complete them. */
const claimExpired = (matchId: string) => {
  const ts = Number(matchId.split(":")[2]);
  return !Number.isFinite(ts) || Date.now() - ts > CLAIM_TTL_MS;
};

/** One active ranked match at a time: the queue resumes it instead of making another. */
async function activeRankedFor(playerId: number) {
  return (await activeMatchesFor(playerId)).find((m) => m.kind === "ranked") ?? null;
}

/** Tickets predating the heartbeat field fall back to their enqueue time. */
async function sweepStale(queue: Collection<QueueDoc>) {
  const cutoff = Date.now() - TICKET_TTL_MS;
  await queue.deleteMany({
    $or: [{ beat: { $lt: cutoff } }, { beat: { $exists: false }, since: { $lt: cutoff } }],
  });
}

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { faction } = await req.json();
  const active = await activeRankedFor(player.id);
  if (active) return NextResponse.json({ matchId: active.id });
  const queue = await queueCol();
  await sweepStale(queue);
  const existing = await queue.findOne({ _id: player.id });
  if (existing?.matchId) {
    // a pairing already landed (or is mid-claim) — never reset a live one
    if (!isClaim(existing.matchId)) return NextResponse.json({ matchId: existing.matchId });
    if (claimExpired(existing.matchId)) {
      await queue.updateOne({ _id: player.id, matchId: existing.matchId }, { $set: { matchId: null } });
    }
    return NextResponse.json({ queued: true });
  }
  const now = Date.now();
  // queue + queue_meta merged into a single ticket document keyed by player id.
  try {
    await queue.updateOne(
      { _id: player.id, matchId: null },
      {
        $set: {
          rating: player.rating,
          since: now,
          faction: factions.includes(faction) ? faction : "pyre",
          beat: now,
        },
      },
      { upsert: true },
    );
  } catch {
    // duplicate _id: the ticket was claimed between the read and the write — leave it be
  }
  return NextResponse.json({ queued: true });
}

export async function GET() {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const queue = await queueCol();
  await sweepStale(queue);
  const now = Date.now();
  // every poll doubles as the ticket heartbeat
  const row = await queue.findOneAndUpdate(
    { _id: player.id },
    { $set: { beat: now } },
    { returnDocument: "after" },
  );
  if (row?.matchId && !isClaim(row.matchId)) {
    await queue.deleteOne({ _id: player.id });
    return NextResponse.json({ matchId: row.matchId });
  }
  // The active-match check runs before the mid-claim wait: if the claimer already
  // created the match (or died right after doing so), the poller still lands in it.
  const active = await activeRankedFor(player.id);
  if (active) {
    if (row) await queue.deleteOne({ _id: player.id });
    return NextResponse.json({ matchId: active.id });
  }
  if (!row) return NextResponse.json({ queued: false });
  if (row.matchId) {
    // mid-claim: the claimer is about to write the real matchId — keep waiting…
    if (!claimExpired(row.matchId)) return NextResponse.json({ queued: true, waited: now - row.since });
    // …unless the claimer died: release the ticket and pair normally again
    await queue.updateOne({ _id: player.id, matchId: row.matchId }, { $set: { matchId: null } });
    row.matchId = null;
  }
  const myFaction = (row.faction ?? "pyre") as FactionId;
  const waited = now - row.since;
  const window = 150 + Math.floor(waited / 5000) * 100;
  // try to pair with another queued human — an atomic claim so only one poller wins the ticket
  const claimTag = `claimed:${player.id}:${now}`;
  const other = await queue.findOneAndUpdate(
    {
      _id: { $ne: player.id },
      matchId: null,
      beat: { $gte: now - BEAT_FRESH_MS },
      rating: { $gte: row.rating - window, $lte: row.rating + window },
    },
    { $set: { matchId: claimTag } },
    { sort: { since: 1 } },
  );
  if (other) {
    // dequeue self only while unclaimed; if someone claimed us first, release and take their match
    const mine = await queue.deleteOne({ _id: player.id, matchId: null });
    if (mine.deletedCount === 0) {
      await queue.updateOne(
        { _id: other._id, matchId: claimTag },
        { $set: { matchId: null } },
      );
      return NextResponse.json({ queued: true, waited });
    }
    const otherFaction = (other.faction ?? "pyre") as FactionId;
    const m = await createMatch({ kind: "ranked", p0: other._id, p1: player.id, p0Faction: otherFaction, p1Faction: myFaction });
    // Guarded by our claim tag: if the other side expired the claim meanwhile, they
    // find this match via their active-match check instead of a clobbered ticket.
    await queue.updateOne({ _id: other._id, matchId: claimTag }, { $set: { matchId: m.id } });
    return NextResponse.json({ matchId: m.id });
  }
  // bot fallback (admin-tunable wait, default 5s): closest-rated bot
  if (waited >= (await getBotWaitMs())) {
    const players = await playersCol();
    // Two index-backed probes (the {isBot, rating} index) beat scanning for MIN(ABS(diff)).
    const [above, below] = await Promise.all([
      players.findOne(
        { isBot: 1, _id: { $ne: 1 }, rating: { $gte: row.rating } },
        { projection: { rating: 1 }, sort: { rating: 1 } },
      ),
      players.findOne(
        { isBot: 1, _id: { $ne: 1 }, rating: { $lt: row.rating } },
        { projection: { rating: 1 }, sort: { rating: -1 } },
      ),
    ]);
    const candidates = [above, below].filter((b) => b !== null);
    const bot = candidates.sort(
      (x, y) => Math.abs(x.rating - row.rating) - Math.abs(y.rating - row.rating),
    )[0];
    if (bot) {
      const mine = await queue.deleteOne({ _id: player.id, matchId: null });
      if (mine.deletedCount === 0) return NextResponse.json({ queued: true, waited });
      const m = await createMatch({ kind: "ranked", p0: player.id, p1: bot._id, p0Faction: myFaction, p1Faction: pick(factions) });
      return NextResponse.json({ matchId: m.id });
    }
  }
  return NextResponse.json({ queued: true, waited });
}

export async function DELETE() {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const queue = await queueCol();
  // Only an unclaimed ticket can simply leave; a claimed one is being turned into a match.
  const res = await queue.deleteOne({ _id: player.id, matchId: null });
  if (res.deletedCount > 0) return NextResponse.json({ left: true });
  const row = await queue.findOne({ _id: player.id });
  if (!row?.matchId) return NextResponse.json({ left: true });
  if (isClaim(row.matchId) && claimExpired(row.matchId)) {
    // dead claimer — no match is coming, so leaving is safe after all
    await queue.deleteOne({ _id: player.id, matchId: row.matchId });
    return NextResponse.json({ left: true });
  }
  // A match with this player exists or is seconds from existing: keep the ticket so
  // the next poll (or the active-match fallback) routes them into it.
  return NextResponse.json({ left: false, pending: true });
}
