/** Game versioning + changelog — the single source of truth for "what shipped when".
 *
 *  Semver with a prerelease tag: 0.x.y-alpha while the game is in alpha testing.
 *  With every deployed update: bump GAME_VERSION and prepend a Release entry here
 *  (newest first). Admins read this via /api/admin/releases on the Releases tab
 *  of /admin, so testers on the allowlist know exactly what to test.
 *
 *  Keep entries simple and client-facing: main features and fixes a tester needs
 *  to evaluate the game — no implementation detail. Releases before 0.1.0-alpha
 *  were reconstructed from git history when versioning began.
 */

export const GAME_VERSION = "0.1.1-alpha";

export type ChangeKind = "Added" | "Changed" | "Fixed";

export interface Release {
  version: string;
  /** Deploy date + time, shown verbatim on the Releases tab */
  releasedAt: string;
  title: string;
  /** One-line summary shown under the version header */
  summary: string;
  sections: { kind: ChangeKind; items: string[] }[];
}

export const RELEASES: Release[] = [
  {
    version: "0.1.1-alpha",
    releasedAt: "2026-07-30 14:52",
    title: "Warden's changelog and a clean ladder",
    summary: "The admin panel now tracks every release, and the ladder lost its placeholder names.",
    sections: [
      {
        kind: "Added",
        items: [
          "Releases page in the admin panel (admins only): every game version with date and time, its features and fixes, and the current build.",
        ],
      },
      {
        kind: "Changed",
        items: [
          "All ladder nicknames regenerated — generic “player12345”-style names are gone for good, and the name generator no longer produces them.",
          "Matchmaking bot wait always works in whole seconds, including old saved values.",
        ],
      },
    ],
  },
  {
    version: "0.1.0-alpha",
    releasedAt: "2026-07-30 14:10",
    title: "First sealed alpha",
    summary: "Versioning begins — from this build on, every update is recorded here.",
    sections: [
      {
        kind: "Added",
        items: [
          "Store cards can be pressed to open a full-size card preview with rules and flavor text.",
        ],
      },
      {
        kind: "Fixed",
        items: [
          "Long card text no longer spills out of the card frame in the store and collection.",
          "Admin matchmaking wait is set in whole seconds — no decimals, no number-arrow buttons, and the Save button is properly sized.",
        ],
      },
    ],
  },
  {
    version: "0.0.4-alpha",
    releasedAt: "2026-07-30 13:29",
    title: "Passwordless sign-in",
    summary: "Signing in is now a single emailed link.",
    sections: [
      {
        kind: "Added",
        items: [
          "Sign-in by email magic link — no passwords to remember.",
          "Account deletion confirmed by email.",
        ],
      },
      {
        kind: "Changed",
        items: [
          "Bots carry human-looking names in matches and on the ladder.",
          "How long matchmaking waits before a bot steps in is tunable by admins.",
        ],
      },
    ],
  },
  {
    version: "0.0.3-alpha",
    releasedAt: "2026-07-29 20:08",
    title: "Server economy",
    summary: "Wallets and purchases moved to the server — nothing is lost between devices.",
    sections: [
      {
        kind: "Added",
        items: [
          "Server-side gold and Aethershard wallets with a full transaction ledger per account.",
          "Account page with purchase history; admin panel; legal pages (privacy, terms, refunds).",
        ],
      },
      {
        kind: "Changed",
        items: [
          "Battles can be resumed after a disconnect; sturdier matchmaking queue.",
        ],
      },
    ],
  },
  {
    version: "0.0.2-alpha",
    releasedAt: "2026-07-28 12:56",
    title: "Battlefields and site identity",
    summary: "The world grew: nine battlefields, accounts, and a proper home at shardfall.app.",
    sections: [
      {
        kind: "Added",
        items: [
          "Nine battlefields; pick your battlefield for practice matches.",
          "Player accounts with online data storage; leaderboard.",
          "World trailer on the landing page; official domain shardfall.app.",
        ],
      },
      {
        kind: "Changed",
        items: [
          "Snappier battles: instant card plays, readable spells, board-side card inspection.",
          "AI opponents are no longer shown as regular players.",
        ],
      },
      {
        kind: "Fixed",
        items: [
          "Main menu fits any viewport size.",
        ],
      },
    ],
  },
  {
    version: "0.0.1-alpha",
    releasedAt: "2026-07-28 00:22",
    title: "First playable",
    summary: "Shardfall becomes playable end to end.",
    sections: [
      {
        kind: "Added",
        items: [
          "The core card game: turn-based battles with a 50-card pool across three factions.",
          "Practice matches against AI, an interactive tutorial, and the first campaign chapters.",
          "Card collection and deck browser; store with card packs; gold and shard currencies.",
          "Lore prologue, league crests, and combat polish.",
        ],
      },
    ],
  },
];
