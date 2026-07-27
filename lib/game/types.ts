/** Shardfall game engine — core types & effect DSL. This file is the contract for card
 *  authoring agents and UI: use ONLY these ops/keywords. */

export type FactionId = "pyre" | "abyss" | "verdant" | "neutral";
export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

/** Static keywords carried on units. Arrival/Last Rites/Ignite are separate fields. */
export type Keyword = "rush" | "guard" | "piercing" | "lifesteal" | "overgrow";

export type TargetReq = "NONE" | "ENEMY_UNIT" | "ANY_UNIT" | "FRIENDLY_UNIT";

export interface EffectOp {
  op:
    | "DAMAGE"              // amount → chosen target unit
    | "DAMAGE_ALL_ENEMIES"  // amount → all enemy units
    | "DAMAGE_RANDOM_ENEMY" // amount → random enemy unit, hero if empty board
    | "DAMAGE_HERO"         // amount → enemy hero
    | "HEAL_HERO"           // amount → own hero (cap 30)
    | "HEAL_TARGET"         // amount → chosen unit
    | "BUFF"                // attack/health → chosen unit
    | "BUFF_ALL_ALLIES"     // attack/health → all friendly units
    | "GRANT_KEYWORD_ALLIES"// keyword → all other friendly units
    | "SUMMON"              // token (card id), count → own board (respects cap)
    | "DRAW"                // amount cards
    | "RETURN_ALL_OTHERS";  // all units except this one back to owners' hands
  amount?: number;
  attack?: number;
  health?: number;
  keyword?: Keyword;
  token?: string;
  count?: number;
}

export interface TriggeredEffect {
  /** Only Arrival (and spells) may require a target; Last Rites must be targetless. */
  target?: TargetReq;
  ops: EffectOp[];
}

export interface GameCard {
  id: string;             // e.g. "pyre-004"
  name: string;
  faction: FactionId;
  type: "unit" | "spell";
  rarity: Rarity;
  cost: number;           // 0-10
  attack?: number;        // units only
  health?: number;        // units only
  keywords?: Keyword[];
  igniteX?: number;       // Ignite X value, units only
  arrival?: TriggeredEffect;   // on play from hand
  lastRites?: TriggeredEffect; // on death (target: undefined only)
  spell?: TriggeredEffect;     // spells: their entire effect
  text: string;           // rules text shown on card
  flavor?: string;
  token?: boolean;        // summoned only, not collectible / not in packs
  /** art path under public/, optional (fallback art used if missing) */
  art?: string;
}

export interface UnitInstance {
  uid: number;
  cardId: string;
  attack: number;
  health: number;
  maxHealth: number;
  keywords: Keyword[];
  igniteX?: number;
  /** turn number the unit entered the board (attack legality) */
  enteredTurn: number;
  /** attacks left this turn (1 normally, refreshed each turn) */
  attacksLeft: number;
}

export interface PlayerState {
  hero: FactionId;        // faction of the hero portrait
  hp: number;
  mana: number;
  manaMax: number;
  /** how many turns this player has taken (drives the accelerated ramp) */
  turnsTaken: number;
  deck: string[];         // card ids, top = end of array
  hand: string[];
  board: UnitInstance[];
  fatigue: number;
}

export interface GameState {
  turn: number;           // global turn counter, starts 1
  active: 0 | 1;
  players: [PlayerState, PlayerState];
  winner: null | 0 | 1;
  rngState: number;       // deterministic PRNG state
  nextUid: number;
}

export type GameAction =
  | { type: "PLAY_CARD"; handIndex: number; targetUid?: number }
  | { type: "ATTACK"; attackerUid: number; targetUid?: number } // no targetUid = enemy hero
  | { type: "END_TURN" };

/** Events emitted per action, in order — the UI animates these sequentially. */
export type GameEvent =
  | { type: "CARD_PLAYED"; player: 0 | 1; cardId: string }
  | { type: "UNIT_SUMMONED"; player: 0 | 1; uid: number; cardId: string }
  | { type: "SPELL_CAST"; player: 0 | 1; cardId: string }
  | { type: "ATTACK"; attackerUid: number; targetUid?: number; player: 0 | 1 }
  | { type: "DAMAGE"; targetUid?: number; player?: 0 | 1; amount: number } // no uid = hero
  | { type: "HEAL"; targetUid?: number; player?: 0 | 1; amount: number }
  | { type: "BUFF"; targetUid: number; attack: number; health: number }
  | { type: "DEATH"; uid: number; player: 0 | 1; cardId: string }
  | { type: "RETURNED"; uid: number; player: 0 | 1; cardId: string }
  | { type: "DRAW"; player: 0 | 1; cardId?: string; burned?: boolean }
  | { type: "FATIGUE"; player: 0 | 1; amount: number }
  | { type: "IGNITE"; uid: number }
  | { type: "OVERGROW"; uid: number }
  | { type: "TURN_START"; player: 0 | 1; turn: number }
  | { type: "GAME_OVER"; winner: 0 | 1 };

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
  error?: string; // set if the action was illegal; state unchanged
}
