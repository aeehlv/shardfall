import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { battleInvitesCol, friendRequestsCol, friendsCol, playersCol } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Escape a user string so it can be used inside a RegExp literally. */
function rx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET() {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const [friendsC, requestsC, invitesC] = await Promise.all([
    friendsCol(), friendRequestsCol(), battleInvitesCol(),
  ]);

  const [friends, requests, invites, outgoing] = await Promise.all([
    friendsC.aggregate([
      { $match: { a: player.id } },
      { $lookup: { from: "players", localField: "b", foreignField: "_id", as: "p" } },
      { $unwind: "$p" },
      { $project: { _id: 0, id: "$p._id", name: "$p.name", rating: "$p.rating", league: "$p.league", isBot: "$p.isBot" } },
    ]).toArray(),
    requestsC.aggregate([
      { $match: { toId: player.id } },
      { $lookup: { from: "players", localField: "fromId", foreignField: "_id", as: "p" } },
      { $unwind: "$p" },
      { $project: { _id: 0, fromId: 1, name: "$p.name", rating: "$p.rating", league: "$p.league" } },
    ]).toArray(),
    invitesC.aggregate([
      { $match: { toId: player.id, status: "pending" } },
      { $lookup: { from: "players", localField: "fromId", foreignField: "_id", as: "p" } },
      { $unwind: "$p" },
      { $project: { _id: 0, id: { $toString: "$_id" }, fromId: 1, matchId: 1, status: 1, name: "$p.name" } },
    ]).toArray(),
    invitesC.aggregate([
      { $match: { fromId: player.id, createdAt: { $gt: Date.now() - 3600_000 } } },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      { $lookup: { from: "players", localField: "toId", foreignField: "_id", as: "p" } },
      { $unwind: "$p" },
      { $project: { _id: 0, id: { $toString: "$_id" }, toId: 1, matchId: 1, status: 1, name: "$p.name" } },
    ]).toArray(),
  ]);

  return NextResponse.json({ friends, requests, invites, outgoing });
}

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { name } = await req.json();
  // `COLLATE NOCASE` equivalent: an anchored, case-insensitive exact match.
  const target = await (await playersCol()).findOne(
    { name: { $regex: `^${rx(String(name))}$`, $options: "i" } },
    { projection: { isBot: 1 } },
  );
  if (!target) return NextResponse.json({ error: "No player with that name" }, { status: 404 });
  if (target._id === player.id) return NextResponse.json({ error: "That's you" }, { status: 400 });

  const requests = await friendRequestsCol();
  const friends = await friendsCol();
  // upsert == INSERT OR IGNORE (unique {fromId, toId})
  await requests.updateOne(
    { fromId: player.id, toId: target._id },
    { $setOnInsert: { createdAt: Date.now() } },
    { upsert: true },
  );
  // bots auto-accept so the feature is testable locally
  if (target.isBot) {
    await requests.deleteOne({ fromId: player.id, toId: target._id });
    await friends.updateOne({ a: player.id, b: target._id }, { $setOnInsert: { a: player.id, b: target._id } }, { upsert: true });
    await friends.updateOne({ a: target._id, b: player.id }, { $setOnInsert: { a: target._id, b: player.id } }, { upsert: true });
    return NextResponse.json({ accepted: true });
  }
  return NextResponse.json({ requested: true });
}

export async function PATCH(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { fromId, accept } = await req.json();
  const from = Number(fromId);
  await (await friendRequestsCol()).deleteOne({ fromId: from, toId: player.id });
  if (accept) {
    const friends = await friendsCol();
    await friends.updateOne({ a: player.id, b: from }, { $setOnInsert: { a: player.id, b: from } }, { upsert: true });
    await friends.updateOne({ a: from, b: player.id }, { $setOnInsert: { a: from, b: player.id } }, { upsert: true });
  }
  return NextResponse.json({ ok: true });
}
