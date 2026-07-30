import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { magicLink } from "better-auth/plugins/magic-link";
import {
  battleInvitesCol,
  campaignChapterRewardsCol,
  campaignProgressCol,
  friendRequestsCol,
  friendsCol,
  getDbSync,
  getMongoClient,
  matchesCol,
  playersCol,
  queueCol,
  transactionsCol,
} from "./server/db";
import { abandonMatch } from "./server/match";
import { sendMagicLinkMail } from "./server/mailer";

/** Local dev + LAN origins that must keep working alongside the deployed ones. */
const LOCAL_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3800",
  "http://localhost:3001",
  "http://192.168.178.20:3800",
  "http://192.168.178.20:3000",
  "http://192.168.178.20:3001",
  "http://10.5.0.2:3800",
  "http://10.5.0.2:3000",
  "http://10.5.0.2:3001",
  "http://192.168.178.*",
];

/** LOCAL_ORIGINS + BETTER_AUTH_URL + comma-separated TRUSTED_ORIGINS + Vercel previews. */
function trustedOrigins(): string[] {
  const extra = (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
  return [
    ...new Set(
      [
        ...LOCAL_ORIGINS,
        (process.env.BETTER_AUTH_URL ?? "").trim(),
        vercelUrl,
        ...extra,
        "https://*.vercel.app",
      ].filter(Boolean),
    ),
  ];
}

/** Erase a departing user's game data: concede live matches, then drop every row
 *  keyed to their player id. Runs in deleteUser's beforeDelete, so a failure here
 *  aborts the account deletion instead of leaving orphaned game data behind. */
async function purgePlayerData(userId: string): Promise<void> {
  const players = await playersCol();
  const player = await players.findOne({ userId }, { projection: { _id: 1 } });
  if (!player) return;
  const pid = player._id;

  const active = await (await matchesCol())
    .find({ status: "active", $or: [{ p0: pid }, { p1: pid }] }, { projection: { _id: 1 } })
    .toArray();
  for (const m of active) await abandonMatch(m._id, pid);

  await (await queueCol()).deleteOne({ _id: pid });
  await (await friendsCol()).deleteMany({ $or: [{ a: pid }, { b: pid }] });
  await (await friendRequestsCol()).deleteMany({ $or: [{ fromId: pid }, { toId: pid }] });
  await (await battleInvitesCol()).deleteMany({ $or: [{ fromId: pid }, { toId: pid }] });
  await (await campaignProgressCol()).deleteMany({ playerId: pid });
  await (await campaignChapterRewardsCol()).deleteMany({ playerId: pid });
  await (await transactionsCol()).deleteMany({ playerId: String(pid) });
  await players.deleteOne({ _id: pid });
}

/** Built lazily so importing this module never requires a live MONGODB_URI at build time. */
const database: ReturnType<typeof mongodbAdapter> = (options) =>
  mongodbAdapter(getDbSync(), { client: getMongoClient() })(options);

/** better-auth server config — email+password and magic links on MongoDB (Atlas). */
export const auth = betterAuth({
  database,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkMail({ email, url });
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
  },
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await purgePlayerData(user.id);
      },
    },
  },
  trustedOrigins: trustedOrigins(),
});
