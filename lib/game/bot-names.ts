/** Bot display names for the seeded ladder — a mix of handle styles so no
 *  single template dominates: spaced two-word handles ("Regime Eraser"),
 *  camel compounds, lowercase tags, first names with digits, and the
 *  occasional leet/underscore relic. Anonymous `playerNNNNNNNN` handles are
 *  deliberately excluded — they read as placeholder accounts. Pure module:
 *  callers pass their own RNG so seeds stay reproducible. */

const WORD_A = [
  "Regime", "Silent", "Iron", "Crimson", "Hollow", "Broken", "Savage", "Lunar", "Static", "Feral",
  "Toxic", "Rogue", "Phantom", "Rusty", "Golden", "Frozen", "Rapid", "Cosmic", "Neon", "Grim",
  "Velvet", "Shadow", "Thunder", "Winter", "Ember", "Obsidian", "Crystal", "Mercury", "Copper", "Sable",
  "Vandal", "Stray", "Bitter", "Pale", "Quiet", "Last", "First", "Northern", "Burnt", "Amber",
  "Cinder", "Gloom", "Hazard", "Ivory", "Jade", "Karmic", "Lone", "Midnight", "Nocturne", "Oblique",
];

const WORD_B = [
  "Eraser", "Reaper", "Drifter", "Warden", "Nomad", "Hermit", "Baron", "Prophet", "Jester", "Widow",
  "Falcon", "Mantis", "Viper", "Raven", "Wolf", "Badger", "Sparrow", "Puppet", "Bishop", "Rook",
  "Sentinel", "Vagrant", "Corsair", "Herald", "Marauder", "Ghost", "Pilgrim", "Tyrant", "Oracle", "Puma",
  "Gambit", "Cinder", "Motive", "Signal", "Verdict", "Cipher", "Anthem", "Requiem", "Zealot", "Harbor",
  "Lantern", "Meridian", "Nadir", "Outcast", "Paradox", "Quarry", "Relic", "Specter", "Tempest", "Union",
];

const LOWER = [
  "mercy", "chaos", "vortex", "glitch", "pixel", "shadow", "storm", "blade", "nova", "zero",
  "ace", "drift", "frost", "venom", "raptor", "comet", "jinx", "hex", "rune", "saber",
  "onyx", "flux", "ember", "wisp", "husk", "grit", "static", "sable", "murk", "cinder",
];

const FIRST = [
  "Alex", "Max", "Denis", "Kirill", "Ivan", "Nikita", "Artem", "Dima", "Sasha", "Egor",
  "Leo", "Marko", "Timur", "Oskar", "Jan", "Tom", "Felix", "Nils", "Erik", "Lukas",
  "Marta", "Nina", "Vera", "Alisa", "Dana", "Mia", "Olav", "Pavel", "Roman", "Stefan",
];

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function digits(rand: () => number, min: number, max: number): string {
  return String(min + Math.floor(rand() * (max - min)));
}

/** One name in one of several styles; may collide — see uniqueBotName. */
export function rollBotName(rand: () => number): string {
  const roll = rand();
  if (roll < 0.29) {
    // spaced two-word handle: "Regime Eraser"
    return `${pick(rand, WORD_A)} ${pick(rand, WORD_B)}`;
  }
  if (roll < 0.46) {
    // camel compound, sometimes numbered: "ShadowGambit7"
    return `${pick(rand, WORD_A)}${pick(rand, WORD_B)}${rand() < 0.4 ? digits(rand, 1, 99) : ""}`;
  }
  if (roll < 0.63) {
    // lowercase tag: "coldmercy92", "vortex_hex"
    const a = pick(rand, LOWER);
    if (rand() < 0.35) return `${a}_${pick(rand, LOWER)}`;
    return `${a}${rand() < 0.6 ? digits(rand, 2, 999) : ""}`;
  }
  if (roll < 0.8) {
    // first name + year/number: "Denis2003", "Marta_99"
    const n = pick(rand, FIRST);
    if (rand() < 0.4) return `${n}${digits(rand, 1990, 2012)}`;
    return `${n}_${digits(rand, 1, 99)}`;
  }
  if (roll < 0.92) {
    // single word, capitalized or not: "Requiem", "saber"
    const w = rand() < 0.5 ? pick(rand, WORD_B) : pick(rand, LOWER);
    return rand() < 0.3 ? `${w}${digits(rand, 1, 999)}` : w;
  }
  // leet / bracket relics: "xX_Reaper_Xx", "D4rkwolf"
  if (rand() < 0.5) return `xX_${pick(rand, WORD_B)}_Xx`;
  return `D4rk${pick(rand, LOWER)}`;
}

/** Collision-free name, capped to the 24-char player-name limit. */
export function uniqueBotName(rand: () => number, used: Set<string>): string {
  for (let i = 0; i < 40; i++) {
    let name = rollBotName(rand).slice(0, 24);
    if (used.has(name)) {
      name = `${name.slice(0, 20)}${digits(rand, 2, 9999)}`.slice(0, 24);
    }
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `${pick(rand, LOWER)}_${pick(rand, LOWER)}${digits(rand, 1000, 999_999)}`.slice(0, 24);
  used.add(fallback);
  return fallback;
}
