"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CARD_POOL } from "@/lib/game/pool";
import { applyAction, getCardSafe, legalAttackTargets, legalEffectTargets, newGame } from "@/lib/game/engine";
import { aiTakeTurn } from "@/lib/game/ai";
import { buildStarterDeck } from "@/lib/game/decks";
import { boardImage, defaultBoardFor } from "@/lib/game/boards";
import type { ActionResult, FactionId, GameAction, GameEvent, GameState } from "@/lib/game/types";
import { applyMatchResult, loadProfile, saveProfile } from "@/lib/profile";
import { usePlayer } from "@/lib/player-context";
import { applyEventToView, fetchMatch, postMatchAction, type MatchView } from "@/lib/online";
import CardFace from "@/components/play/CardFace";
import FramedCard from "@/components/play/FramedCard";
import UnitTile, { type FxNumber } from "@/components/play/UnitTile";
import CampaignRewards, {
  type CampaignStarDetail, type ChapterBonusInfo, type PacksInput,
} from "@/components/campaign/CampaignRewards";
import TutorialOverlay from "./TutorialOverlay";
import { play as playSfx, preload as preloadSfx, startMusic } from "@/lib/sound";
import "./play.css";

const HERO_ART: Record<string, string> = {
  pyre: "/cards/art/pyre.jpg", abyss: "/cards/art/abyss.jpg",
  verdant: "/cards/art/verdant.jpg", neutral: "/cards/art/verdant.jpg",
};
const FRAMED_FACTIONS = new Set(["pyre", "abyss", "verdant", "neutral"]);
const TURN_SECONDS = 60;
const ONLINE_TURN_SECONDS = 75;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fxKey = 1;

interface EndedInfo {
  won: boolean; gold: number; xp: number; levelUps: number;
  ratingDelta?: number; rating?: number; league?: string; pack?: string; firstClear?: boolean;
  /** campaign matches only — presence of `stars` switches to the campaign reward screen */
  stars?: number; bestStars?: number; maxStars?: number;
  starDetails?: CampaignStarDetail[];
  nodeId?: string; nodeName?: string; chapter?: number; chapterName?: string;
  shards?: number; packs?: PacksInput;
  card?: string;
  chapterComplete?: boolean | ChapterBonusInfo | null;
  /** daily practice cap reached — show the overlay without a reward line */
  noReward?: boolean;
}

export default function PlayClient() {
  const params = useSearchParams();
  const router = useRouter();
  const matchId = params.get("match");
  const online = !!matchId;
  const playerFaction = (["pyre", "abyss", "verdant"].includes(params.get("deck") ?? "")
    ? params.get("deck") : "pyre") as FactionId;
  const tutorial = !online && params.get("tutorial") === "1";
  const boardParam = params.get("board");

  const offlineEnemy = useMemo<FactionId>(() => {
    const others = (["pyre", "abyss", "verdant"] as FactionId[]).filter((f) => f !== playerFaction);
    return tutorial ? others[0] : others[Math.floor(Math.random() * others.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [game, setGame] = useState<GameState | null>(null);
  const [enemyFaction, setEnemyFaction] = useState<FactionId>(offlineEnemy);
  const [busy, setBusy] = useState(false);
  const [selCard, setSelCard] = useState<number | null>(null);
  const [selAttacker, setSelAttacker] = useState<number | null>(null);
  const [fxMap, setFxMap] = useState<Record<string, FxNumber[]>>({});
  const [dying, setDying] = useState<Set<number>>(new Set());
  const [reveal, setReveal] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ended, setEnded] = useState<EndedInfo | null>(null);
  const [zoomCard, setZoomCard] = useState<{ id: string; x: number; y: number; src: "hand" | "board" } | null>(null);
  const [tutStep, setTutStep] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [oppInfo, setOppInfo] = useState<MatchView["opponent"]>(null);
  const [drag, setDrag] = useState<{ index: number; x: number; y: number } | null>(null);
  const [bursts, setBursts] = useState<{ key: number; x: number; y: number }[]>([]);
  const [spawning, setSpawning] = useState<Set<number>>(new Set());
  const [sprites, setSprites] = useState<{ key: number; kind: string; x: number; y: number; s: number }[]>([]);
  const [bolts, setBolts] = useState<{ key: number; x: number; y: number; dx: number; dy: number; hue: string }[]>([]);
  const [flyers, setFlyers] = useState<{ key: number; x: number; y: number; dx: number; dy: number }[]>([]);
  const [concedeArmed, setConcedeArmed] = useState(false);
  const [connLost, setConnLost] = useState(false);
  const [initError, setInitError] = useState(false);

  const { signedIn, refresh: refreshPlayer } = usePlayer();

  const unitRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const handRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const arrowRef = useRef<SVGPathElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const endedRef = useRef(false);
  const dragStart = useRef<{ index: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const seqRef = useRef(-1);
  const pollingRef = useRef(false);
  const pollFailsRef = useRef(0);
  const pendingRef = useRef(0);
  // Bumped whenever a send fails: queued optimistic sends captured an older
  // generation and drop instead of replaying stale handIndex payloads.
  const genRef = useRef(0);
  // A send failed AND its resync failed — force a snapshot on the next good poll.
  const needsResyncRef = useRef(false);
  const netChain = useRef<Promise<void>>(Promise.resolve());
  const gameRef = useRef<GameState | null>(null);

  useEffect(() => { gameRef.current = game; }, [game]);

  const pushFx = useCallback((key: string, fx: FxNumber) => {
    setFxMap((m) => ({ ...m, [key]: [...(m[key] ?? []), fx] }));
    setTimeout(() => {
      setFxMap((m) => ({ ...m, [key]: (m[key] ?? []).filter((f) => f.key !== fx.key) }));
    }, 900);
  }, []);

  const spawnSprite = useCallback((kind: string, x: number, y: number, size = 130, life = 750) => {
    const key = fxKey++;
    setSprites((sp) => [...sp, { key, kind, x, y, s: size }]);
    setTimeout(() => setSprites((sp) => sp.filter((f) => f.key !== key)), life);
  }, []);

  const rectCenter = (el: Element | null | undefined): { x: number; y: number } | null => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const targetPoint = useCallback((targetUid?: number, player?: 0 | 1): { x: number; y: number } | null => {
    if (targetUid !== undefined) return rectCenter(unitRefs.current.get(targetUid));
    if (player !== undefined) {
      return rectCenter(boardRef.current?.querySelector(
        player === 0 ? ".heroCorner.mine" : ".heroCorner.foe"));
    }
    return null;
  }, []);

  const fireBolt = useCallback(async (from: { x: number; y: number }, to: { x: number; y: number }, hue: string) => {
    const key = fxKey++;
    setBolts((b) => [...b, { key, x: from.x, y: from.y, dx: to.x - from.x, dy: to.y - from.y, hue }]);
    await sleep(340);
    setBolts((b) => b.filter((x) => x.key !== key));
  }, []);

  /** Face-down card gliding from the opponent's hand onto the field. */
  const flyEnemyCard = useCallback(async () => {
    const from = rectCenter(boardRef.current?.querySelector(".enemyHand"))
      ?? { x: 140, y: 60 };
    const to = rectCenter(boardRef.current?.querySelector(".boardRow.enemy"))
      ?? { x: (typeof window !== "undefined" ? window.innerWidth : 1500) / 2, y: 300 };
    const key = fxKey++;
    setFlyers((f) => [...f, { key, x: from.x, y: from.y, dx: to.x - from.x, dy: to.y - from.y }]);
    await sleep(560);
    setFlyers((f) => f.filter((x) => x.key !== key));
  }, []);

  const finishOffline = useCallback(async (won: boolean) => {
    if (endedRef.current) return;
    endedRef.current = true;
    playSfx(won ? "victory" : "defeat", 0.55);
    if (signedIn && tutorial) {
      // tutorials never touch the practice daily cap — no server reward
      await sleep(400);
      setEnded({ won, gold: 0, xp: 0, levelUps: 0, noReward: true });
      return;
    }
    if (signedIn) {
      // signed-in practice: the server grants the reward (and enforces the daily cap)
      let granted: { gold: number; xp: number; levelUps?: number } | null = null;
      try {
        const r = await fetch("/api/practice/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ won }),
        });
        const j = await r.json();
        if (r.ok) granted = j.granted ?? { gold: 0, xp: 0 };
        void refreshPlayer();
      } catch { /* reward stays server-side truth: show none */ }
      await sleep(400);
      setEnded(granted
        ? { won, gold: granted.gold, xp: granted.xp, levelUps: granted.levelUps ?? 0 }
        : { won, gold: 0, xp: 0, levelUps: 0, noReward: true });
      return;
    }
    const profile = loadProfile();
    const reward = applyMatchResult(profile, won);
    saveProfile(profile);
    await sleep(400);
    setEnded({ won, ...reward });
  }, [signedIn, tutorial, refreshPlayer]);

  const animate = useCallback(async (r: { state: GameState; events: GameEvent[] }, aiSide: boolean) => {
    let spellFrom: { x: number; y: number } | null = null;
    // step the board forward event by event so nothing pops in all at once
    let view: GameState | null = gameRef.current ? structuredClone(gameRef.current) : null;
    const step = (ev: GameEvent) => {
      if (!view) return;
      view = applyEventToView(view, ev, getCardSafe);
      gameRef.current = view;
      setGame(view);
    };
    for (const ev of r.events) {
      // deaths animate first, then leave the board; everything else lands immediately
      if (ev.type !== "DEATH" && ev.type !== "RETURNED") step(ev);
      switch (ev.type) {
        case "CARD_PLAYED":
          // opponent plays stay face-down: a card glides in, then resolves
          if (ev.player === 1) {
            await sleep(260);
            await flyEnemyCard();
          }
          break;
        case "SPELL_CAST": {
          playSfx("spell", 0.5);
          if (ev.player === 0 && ev.cardId) {
            // brief flourish so a spell that hits the hero directly still reads
            setReveal(ev.cardId);
            await sleep(430);
            setReveal(null);
          }
          spellFrom = rectCenter(boardRef.current?.querySelector(
            ev.player === 0 ? ".heroCorner.mine" : ".heroCorner.foe"));
          break;
        }
        case "UNIT_SUMMONED": {
          playSfx("card-play", 0.5);
          const uid = ev.uid;
          setSpawning((sp) => new Set(sp).add(uid));
          setTimeout(() => setSpawning((sp) => { const n = new Set(sp); n.delete(uid); return n; }), 520);
          await sleep(ev.player === 1 ? 480 : 140);
          break;
        }
        case "ATTACK": {
          const el = unitRefs.current.get(ev.attackerUid);
          if (el) {
            let dx = 0, dy = ev.player === 0 ? -70 : 70;
            const tEl = ev.targetUid !== undefined ? unitRefs.current.get(ev.targetUid) : null;
            if (tEl) {
              const a = el.getBoundingClientRect();
              const b = tEl.getBoundingClientRect();
              dx = (b.left - a.left) * 0.72; dy = (b.top - a.top) * 0.72;
            }
            el.style.setProperty("--lx", `${dx}px`);
            el.style.setProperty("--ly", `${dy}px`);
            el.classList.add("lunging");
            await sleep(ev.player === 0 ? 230 : 300);
            el.classList.remove("lunging");
            await sleep(ev.player === 0 ? 110 : 170); // home before any death plays
            if (ev.player === 1) await sleep(200); // let each enemy strike land separately
          }
          const hit = ev.targetUid !== undefined
            ? unitRefs.current.get(ev.targetUid)
            : boardRef.current?.querySelector<HTMLElement>(
                ev.player === 0 ? ".heroCorner.foe" : ".heroCorner.mine");
          if (hit) {
            playSfx("attack", 0.55);
            hit.classList.add("hitShake");
            setTimeout(() => hit.classList.remove("hitShake"), 420);
            const c = rectCenter(hit);
            if (c) spawnSprite("slash", c.x, c.y, 150, 600);
          }
          break;
        }
        case "DAMAGE": {
          const pt = targetPoint(ev.targetUid, ev.player);
          if (spellFrom && pt) {
            await fireBolt(spellFrom, pt, "#a45ae0");
            spawnSprite("curse", pt.x, pt.y, 140, 650);
            spellFrom = null;
          }
          if (ev.targetUid !== undefined) pushFx(String(ev.targetUid), { key: fxKey++, text: `-${ev.amount}`, kind: "damage" });
          else if (ev.player !== undefined) pushFx(`hero${ev.player}`, { key: fxKey++, text: `-${ev.amount}`, kind: "damage" });
          await sleep(140);
          break;
        }
        case "HEAL": {
          const pt = targetPoint(ev.targetUid, ev.player);
          if (spellFrom && pt) { await fireBolt(spellFrom, pt, "#8cc152"); spellFrom = null; }
          if (pt) { spawnSprite("heal", pt.x, pt.y, 130, 750); playSfx("heal", 0.45); }
          if (ev.targetUid !== undefined) pushFx(String(ev.targetUid), { key: fxKey++, text: `+${ev.amount}`, kind: "heal" });
          else if (ev.player !== undefined) pushFx(`hero${ev.player}`, { key: fxKey++, text: `+${ev.amount}`, kind: "heal" });
          await sleep(160);
          break;
        }
        case "BUFF": {
          const pt = targetPoint(ev.targetUid);
          if (spellFrom && pt) { await fireBolt(spellFrom, pt, "#e3a44a"); spellFrom = null; }
          if (pt) { spawnSprite("buff", pt.x, pt.y, 120, 650); playSfx("buff", 0.4); }
          pushFx(String(ev.targetUid), { key: fxKey++, text: `+${ev.attack}/+${ev.health}`, kind: "buff" });
          await sleep(140);
          break;
        }
        case "DEATH": {
          const pt = rectCenter(unitRefs.current.get(ev.uid));
          playSfx("shatter", 0.5);
          if (pt) spawnSprite("shatter", pt.x, pt.y, 165, 700);
          setDying((s) => new Set(s).add(ev.uid));
          await sleep(240);
          step(ev);
          break;
        }
        case "RETURNED":
          setDying((s) => new Set(s).add(ev.uid));
          await sleep(300);
          step(ev);
          break;
        case "IGNITE": {
          const el = unitRefs.current.get(ev.uid);
          el?.classList.add("igniting");
          const pt = rectCenter(el);
          if (pt) spawnSprite("fire", pt.x, pt.y, 120, 600);
          await sleep(280);
          el?.classList.remove("igniting");
          break;
        }
        case "TURN_START":
          if (ev.player === 0) playSfx("turn", 0.4);
          setBanner(ev.player === 0 ? "Your Turn" : "Enemy Turn");
          setTimeout(() => setBanner(null), 1100);
          await sleep(320);
          break;
        case "GAME_OVER":
          break;
      }
    }
    setDying(new Set());
    setGame(r.state);
    if (!online && r.state.winner !== null) await finishOffline(r.state.winner === 0);
  }, [pushFx, finishOffline, online, spawnSprite, targetPoint, fireBolt, flyEnemyCard]);

  /** Online: absorb a server view — animate its events, sync state/seq/deadline/rewards. */
  const absorbView = useCallback(async (view: MatchView) => {
    if (view.error) { setToast(view.error); setTimeout(() => setToast(null), 1600); return; }
    seqRef.current = view.seq;
    setDeadline(view.turnDeadline);
    if (view.opponent) setOppInfo(view.opponent);
    await animate({ state: view.state, events: view.events }, false);
    if (view.rewards && !endedRef.current) {
      endedRef.current = true;
      void refreshPlayer(); // rewards landed server-side — re-sync the wallet
      playSfx((view.rewards as EndedInfo).won ? "victory" : "defeat", 0.55);
      await sleep(400);
      setEnded(view.rewards as EndedInfo);
    }
  }, [animate, refreshPlayer]);

  /** Online: jump straight to a server view without animating anything. */
  const applySnapshot = useCallback(async (view: MatchView) => {
    seqRef.current = view.seq;
    setDeadline(view.turnDeadline);
    if (view.opponent) setOppInfo(view.opponent);
    setDying(new Set());
    gameRef.current = view.state;
    setGame(view.state);
    if (view.rewards && !endedRef.current) {
      endedRef.current = true;
      void refreshPlayer(); // rewards landed server-side — re-sync the wallet
      playSfx((view.rewards as EndedInfo).won ? "victory" : "defeat", 0.55);
      await sleep(400);
      setEnded(view.rewards as EndedInfo);
    }
  }, [refreshPlayer]);

  /** Online: full refetch + snapshot when the client and server may disagree. */
  const resyncNow = useCallback(async (): Promise<boolean> => {
    if (!matchId) return false;
    try {
      const view = await fetchMatch(matchId, -1);
      if (view.error) return false;
      await applySnapshot(view);
      return true;
    } catch {
      return false;
    }
  }, [matchId, applySnapshot]);

  // ---- init -----------------------------------------------------------------
  useEffect(() => {
    preloadSfx(["click", "card-play", "attack", "shatter", "heal", "buff", "spell", "turn", "match-start", "victory", "defeat"]);
    playSfx("match-start", 0.5);
    startMusic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const initOnline = useCallback(async () => {
    if (!matchId) return;
    try {
      // jump straight to the current snapshot — never replay match history
      const view = await fetchMatch(matchId, -1);
      if (view.error) { setToast(view.error); setTimeout(() => router.push("/"), 1500); return; }
      setEnemyFaction((view.state.players[1].hero as FactionId) ?? "verdant");
      await applySnapshot(view);
      setBanner(view.state.active === 0 ? "Your Turn" : "Enemy Turn");
      setTimeout(() => setBanner(null), 1200);
    } catch {
      setInitError(true);
    }
  }, [matchId, applySnapshot, router]);
  useEffect(() => {
    if (online && matchId) {
      void (async () => { await initOnline(); })();
      return;
    }
    const seed = tutorial ? 12345 : (Date.now() % 2147483647);
    const g = newGame(
      buildStarterDeck(CARD_POOL, playerFaction),
      buildStarterDeck(CARD_POOL, offlineEnemy),
      seed, playerFaction, offlineEnemy,
    );
    setGame(g);
    setBanner("Your Turn");
    setTimeout(() => setBanner(null), 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAiTurn = useCallback(async (state: GameState) => {
    const steps = aiTakeTurn(state);
    let cur = state;
    for (const step of steps) {
      await sleep(520);
      await animate(step.result, true);
      cur = step.result.state;
      if (cur.winner !== null) return;
    }
  }, [animate]);

  const doPlayerAction = useCallback(async (action: GameAction) => {
    if (!game || busy || game.winner !== null || game.active !== 0 || endedRef.current) return;
    setSelCard(null); setSelAttacker(null);
    if (online && matchId) {
      // Optimistic play: run the same deterministic engine locally so the card
      // lands the instant it is released, then reconcile with the server.
      // Only for plays/attacks — END_TURN pulls in the opponent's whole turn.
      const optimistic = action.type !== "END_TURN" ? applyAction(game, action) : null;
      if (optimistic?.error) {
        setToast(optimistic.error);
        setTimeout(() => setToast(null), 1500);
        return;
      }
      // Confirm with the server in the background, one request at a time.
      const gen = genRef.current;
      const send = async () => {
        // A previous send in this chain failed and resynced — this action's
        // handIndex/uids were computed against a state that no longer exists.
        if (gen !== genRef.current) return;
        let view: MatchView;
        try {
          view = await postMatchAction(matchId, { action, since: seqRef.current });
        } catch {
          genRef.current += 1;
          pendingRef.current = 0;
          setConnLost(true);
          if (await resyncNow()) {
            pollFailsRef.current = 0;
            setTimeout(() => setConnLost(false), 1200);
          } else {
            needsResyncRef.current = true;
          }
          return;
        }
        if (view.error) {
          genRef.current += 1;
          pendingRef.current = 0;
          setToast(view.error);
          setTimeout(() => setToast(null), 1600);
          if (!(await resyncNow())) needsResyncRef.current = true;
          return;
        }
        if (optimistic) pendingRef.current -= 1;
        if (optimistic) {
          if (pendingRef.current > 0 && !view.rewards) {
            // Later optimistic actions are already on the board — applying this
            // snapshot would roll them back, so only sync the bookkeeping and
            // let the final confirmation reconcile the state.
            seqRef.current = view.seq;
            setDeadline(view.turnDeadline);
            if (view.opponent) setOppInfo(view.opponent);
            return;
          }
          // our own events already animated optimistically — take the server
          // state as-is (any extra server events land as an instant update)
          await applySnapshot(view);
          return;
        }
        await absorbView(view);
      };

      if (optimistic) {
        // Play it out locally right now, then hand control straight back —
        // waiting on the round-trip is what made the board feel sticky.
        pendingRef.current += 1;
        setBusy(true);
        await animate({ state: optimistic.state, events: optimistic.events }, false);
        setBusy(false);
        netChain.current = netChain.current.then(send).catch(() => {});
        return;
      }

      setBusy(true);
      netChain.current = netChain.current.then(send).catch(() => {});
      await netChain.current;
      setBusy(false);
      return;
    }
    const r = applyAction(game, action);
    if (r.error) { setToast(r.error); setTimeout(() => setToast(null), 1500); return; }
    setBusy(true);
    await animate(r, false);
    if (action.type === "END_TURN" && r.state.winner === null) {
      await runAiTurn(r.state);
      setTimeLeft(TURN_SECONDS);
    }
    setBusy(false);
  }, [game, busy, animate, runAiTurn, online, matchId, absorbView, applySnapshot, resyncNow]);

  // ---- online polling -------------------------------------------------------
  useEffect(() => {
    if (!online || !matchId || ended) return;
    const iv = setInterval(() => {
      if (pollingRef.current || busy) return;
      // never poll ahead of the init snapshot — since=-1 would replay history
      if (gameRef.current === null) return;
      pollingRef.current = true;
      // fetch AND apply on the netChain so a poll can never interleave with an
      // in-flight action (and always fetches from the freshest seq)
      netChain.current = netChain.current
        .then(async () => {
          if (needsResyncRef.current) {
            // an unconfirmed action may still be on the board — snapshot first
            if (await resyncNow()) {
              needsResyncRef.current = false;
              pollFailsRef.current = 0;
              setConnLost(false);
            }
            return;
          }
          const view = await fetchMatch(matchId, seqRef.current);
          pollFailsRef.current = 0;
          setConnLost(false);
          if (view.error) return;
          if (view.seq > seqRef.current || view.rewards) {
            if (seqRef.current === -1) await applySnapshot(view);
            else await absorbView(view);
          } else {
            setDeadline(view.turnDeadline);
          }
        })
        .catch(() => {
          pollFailsRef.current += 1;
          if (pollFailsRef.current >= 3) setConnLost(true);
        })
        .finally(() => { pollingRef.current = false; });
    }, 2500);
    return () => clearInterval(iv);
  }, [online, matchId, ended, busy, absorbView, applySnapshot, resyncNow]);

  // ---- turn timer -----------------------------------------------------------
  const myTurn = !!game && game.active === 0 && !busy && game.winner === null && !ended;
  useEffect(() => {
    if (tutorial) return;
    if (online) {
      const iv = setInterval(() => {
        if (deadline) setTimeLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      }, 500);
      return () => clearInterval(iv);
    }
    if (!myTurn) return;
    const iv = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(iv);
  }, [myTurn, tutorial, online, deadline]);
  useEffect(() => {
    if (!online && timeLeft === 0 && myTurn && !tutorial) {
      setSelCard(null); setSelAttacker(null);
      void doPlayerAction({ type: "END_TURN" });
      setTimeLeft(TURN_SECONDS);
    }
  }, [timeLeft, myTurn, tutorial, doPlayerAction, online]);

  // ---- targeting arrow ------------------------------------------------------
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const line = arrowRef.current;
      const board = boardRef.current;
      if (!line || !board) return;
      const src = selAttacker !== null
        ? unitRefs.current.get(selAttacker)
        : selCard !== null ? handRefs.current.get(selCard) : null;
      const from = src?.getBoundingClientRect();
      const b = board.getBoundingClientRect();
      const x2 = e.clientX - b.left;
      const y2 = e.clientY - b.top;
      const x1 = from ? from.left + from.width / 2 - b.left : x2;
      const y1 = from ? from.top + from.height / 3 - b.top : y2 + 120;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.hypot(dx, dy) || 1;
      // bow perpendicular to travel, scaled by distance, always to the same side
      const bow = Math.min(120, 30 + dist * 0.22);
      const nx = -dy / dist;
      const ny = dx / dist;
      const side = dx >= 0 ? 1 : -1;
      const cx = (x1 + x2) / 2 + nx * bow * side;
      const cy = (y1 + y2) / 2 + ny * bow * side;
      line.setAttribute("d", `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
      const ret = board.querySelector(".targetReticle");
      if (ret) { ret.setAttribute("cx", String(x2)); ret.setAttribute("cy", String(y2)); }
    };
    if (selAttacker !== null || selCard !== null) {
      window.addEventListener("mousemove", onMove);
      return () => window.removeEventListener("mousemove", onMove);
    }
  }, [selAttacker, selCard]);

  // ---- cancel targeting -----------------------------------------------------
  useEffect(() => {
    const cancel = () => { setSelCard(null); setSelAttacker(null); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    const onCtx = (e: MouseEvent) => {
      if (selCard !== null || selAttacker !== null) { e.preventDefault(); cancel(); }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onCtx);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("contextmenu", onCtx); };
  }, [selCard, selAttacker]);

  // ---- drag to play ---------------------------------------------------------
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const st = dragStart.current;
      if (!st) return;
      if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) st.moved = true;
      if (st.moved) setDrag({ index: st.index, x: e.clientX, y: e.clientY });
    };
    const onUp = (e: PointerEvent) => {
      const st = dragStart.current;
      dragStart.current = null;
      if (!st) return;
      if (!st.moved) { setDrag(null); return; }
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 250);
      setDrag(null);
      const h = window.innerHeight;
      const droppedOnField = e.clientY > h * 0.12 && e.clientY < h * 0.74;
      if (!droppedOnField || !game) return;
      const cardId = game.players[0].hand[st.index];
      if (cardId === undefined || cardId === "hidden") return;
      const card = getCardSafe(cardId);
      if (card.cost > game.players[0].mana) { setToast("Not enough aether"); setTimeout(() => setToast(null), 1200); return; }
      const eff = card.type === "unit" ? card.arrival : card.spell;
      const needsTarget = (eff?.target ?? "NONE") !== "NONE" && legalEffectTargets(game, 0, eff).length > 0;
      if (needsTarget) {
        setSelAttacker(null); setSelCard(st.index);
      } else {
        const key = fxKey++;
        setBursts((b) => [...b, { key, x: e.clientX, y: e.clientY }]);
        setTimeout(() => setBursts((b) => b.filter((x) => x.key !== key)), 700);
        void doPlayerAction({ type: "PLAY_CARD", handIndex: st.index });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [game, doPlayerAction]);

  if (!game) {
    if (initError) {
      return (
        <div className="playLoading" style={{ flexDirection: "column", gap: 18 }}>
          <span>Connection lost — the Rift will not open.</span>
          <button className="btn primary" style={{ fontSize: "1rem" }}
            onClick={() => { setInitError(false); void initOnline(); }}>
            Retry
          </button>
        </div>
      );
    }
    return <div className="playLoading">Entering Kelvarrow…</div>;
  }

  const me = game.players[0];
  const foe = game.players[1];
  const turnMax = online ? ONLINE_TURN_SECONDS : TURN_SECONDS;

  const cardNeedsTarget = (handIndex: number): boolean => {
    const card = getCardSafe(me.hand[handIndex]);
    const eff = card.type === "unit" ? card.arrival : card.spell;
    if ((eff?.target ?? "NONE") === "NONE") return false;
    return legalEffectTargets(game, 0, eff).length > 0;
  };
  const legalCardTargets: number[] = selCard !== null
    ? legalEffectTargets(game, 0, (() => { const c = getCardSafe(me.hand[selCard]); return c.type === "unit" ? c.arrival : c.spell; })())
    : [];
  const attackTargets = selAttacker !== null ? legalAttackTargets(game, selAttacker) : [];

  const clickHandCard = (i: number) => {
    if (!myTurn || suppressClick.current) return;
    if (me.hand[i] === "hidden") return; // unresolved optimistic draw — wait for the server card
    const card = getCardSafe(me.hand[i]);
    if (card.cost > me.mana) { setToast("Not enough aether"); setTimeout(() => setToast(null), 1200); return; }
    if (cardNeedsTarget(i)) { setSelAttacker(null); setSelCard(selCard === i ? null : i); }
    else void doPlayerAction({ type: "PLAY_CARD", handIndex: i });
  };
  const clickMyUnit = (uid: number) => {
    if (!myTurn) return;
    if (selCard !== null && legalCardTargets.includes(uid)) {
      void doPlayerAction({ type: "PLAY_CARD", handIndex: selCard, targetUid: uid });
      return;
    }
    if (legalAttackTargets(game, uid).length > 0) { setSelCard(null); setSelAttacker(selAttacker === uid ? null : uid); }
  };
  const clickEnemyUnit = (uid: number) => {
    if (!myTurn) return;
    if (selCard !== null && legalCardTargets.includes(uid)) {
      void doPlayerAction({ type: "PLAY_CARD", handIndex: selCard, targetUid: uid });
    } else if (selAttacker !== null && attackTargets.includes(uid)) {
      void doPlayerAction({ type: "ATTACK", attackerUid: selAttacker, targetUid: uid });
    }
  };
  const clickEnemyHero = () => {
    if (!myTurn) return;
    if (selAttacker !== null && attackTargets.includes(undefined)) {
      void doPlayerAction({ type: "ATTACK", attackerUid: selAttacker });
    }
  };
  const concede = () => {
    if (tutorial) { router.push("/"); return; }
    if (!concedeArmed) { setConcedeArmed(true); setTimeout(() => setConcedeArmed(false), 3000); return; }
    if (online && matchId) {
      netChain.current = netChain.current
        .then(async () => {
          const view = await postMatchAction(matchId, { resign: true, since: seqRef.current });
          await absorbView(view);
        })
        .catch(() => { setConnLost(true); });
    } else {
      void finishOffline(false);
    }
  };

  const refCb = (uid: number) => (el: HTMLDivElement | null) => {
    if (el) unitRefs.current.set(uid, el);
    else unitRefs.current.delete(uid);
  };

  const manaFrac = me.manaMax > 0 ? me.mana / me.manaMax : 0;
  const RING_R = 50;
  const RING_C = 2 * Math.PI * RING_R;
  const zoomDef = zoomCard && zoomCard.id !== "hidden" ? getCardSafe(zoomCard.id) : null;
  const revealDef = reveal ? getCardSafe(reveal) : null;

  /* eslint-disable @next/next/no-img-element */
  return (
    <main className="playMain" ref={boardRef}
      style={{ backgroundImage: `url(${boardImage(boardParam ?? defaultBoardFor(enemyFaction))})` }}>
      <div className="boardVeil" />

      {/* enemy top bar + corner avatar */}
      <div className="heroRow top">
        <div className="enemyHand">
          {foe.hand.map((_, i) => <div key={i} className="enemyCardBack" style={{ transform: `rotate(${(i - foe.hand.length / 2) * 4}deg)` }} />)}
        </div>
        {oppInfo && (
          <div className="oppTag" data-testid="opp-tag">
            <b>{oppInfo.name}</b>
            <span className={`leagueBadge l-${oppInfo.league}`}>
              <img className="leagueCrestSm" src={`/ui/leagues/${oppInfo.league.toLowerCase()}.png`} alt="" />
              {oppInfo.league} · {oppInfo.rating}
            </span>
          </div>
        )}
        <button className={`concedeBtn${concedeArmed ? " armed" : ""}`} data-testid="concede" onClick={concede}>
          {tutorial ? "Leave Tutorial" : concedeArmed ? "Concede?" : "Concede"}
        </button>
      </div>
      <div className={`heroCorner foe heroPanel${selAttacker !== null && attackTargets.includes(undefined) ? " legalTarget" : ""}`}
        onClick={clickEnemyHero}>
        <div className="footGlow foeGlow" aria-hidden="true" />
        <img className="heroFigure flip" src={`/board/avatars/${foe.hero}.png`} alt="Enemy champion" />
        <div className="heroPlate foePlate"><div className="heroHp">{foe.hp}</div></div>
        <div className="heroFx">{(fxMap["hero1"] ?? []).map((f) => <span key={f.key} className={`fxNum ${f.kind}`}>{f.text}</span>)}</div>
      </div>

      {/* battlefield */}
      <div className="field">
        <div className="boardRow enemy">
          {foe.board.map((u) => (
            <UnitTile key={u.uid} unit={u} refCb={refCb(u.uid)}
              legalTarget={(selCard !== null && legalCardTargets.includes(u.uid)) || (selAttacker !== null && attackTargets.includes(u.uid))}
              dying={dying.has(u.uid)}
              spawning={spawning.has(u.uid)}
              onHover={(id, el) => setZoomCard(id && el ? { id, ...rectCenter(el)!, src: "board" } : null)}
              onClick={() => clickEnemyUnit(u.uid)}
              fx={fxMap[String(u.uid)]}
            />
          ))}
        </div>
        <div className="fieldDivider" />
        <div className={`boardRow mine${drag ? " dropHint" : ""}`}>
          {me.board.map((u) => (
            <UnitTile key={u.uid} unit={u} refCb={refCb(u.uid)}
              ready={myTurn && legalAttackTargets(game, u.uid).length > 0}
              selected={selAttacker === u.uid}
              legalTarget={selCard !== null && legalCardTargets.includes(u.uid)}
              dying={dying.has(u.uid)}
              spawning={spawning.has(u.uid)}
              resting={myTurn && legalAttackTargets(game, u.uid).length === 0 &&
                (u.attacksLeft <= 0 || (u.enteredTurn === game.turn && !u.keywords.includes("rush")))}
              onHover={(id, el) => setZoomCard(id && el ? { id, ...rectCenter(el)!, src: "board" } : null)}
              onClick={() => clickMyUnit(u.uid)}
              fx={fxMap[String(u.uid)]}
            />
          ))}
        </div>
      </div>

      {/* my corner avatar */}
      <div className="heroCorner mine heroPanel" data-testid="my-hero">
        <div className="footGlow" aria-hidden="true" />
        <img className="heroFigure" src={`/board/avatars/${me.hero}.png`} alt="Your champion" />
        <div className="heroPlate">
          <div className="heroHp">{me.hp}</div>
          <div className="manaPips" title={`${me.mana}/${me.manaMax} aether`}>
            {Array.from({ length: Math.max(me.manaMax, 1) }).map((_, i) => (
              <span key={i} className={`pip${i < me.mana ? " on" : ""}`} />
            ))}
            <b key={`${me.mana}-${game.turn}`}>{me.mana}/{me.manaMax}</b>
          </div>
        </div>
        <div className="heroFx">{(fxMap["hero0"] ?? []).map((f) => <span key={f.key} className={`fxNum ${f.kind}`}>{f.text}</span>)}</div>
      </div>

      {/* my hand row */}
      <div className="heroRow bottom">
        <div className="hand">
          {me.hand.map((id, i) => {
            const card = getCardSafe(id);
            return (
              <div key={`${id}-${i}`}
                ref={(el) => { if (el) handRefs.current.set(i, el); else handRefs.current.delete(i); }}
                className={`handSlot${selCard === i ? " selectedCard" : ""}${drag?.index === i ? " dragging" : ""}`}
                onMouseEnter={(e) => setZoomCard({ id, ...rectCenter(e.currentTarget)!, src: "hand" })}
                onMouseLeave={() => setZoomCard(null)}
                onPointerDown={(e) => {
                  if (!myTurn) return;
                  dragStart.current = { index: i, x: e.clientX, y: e.clientY, moved: false };
                }}
                onClick={() => clickHandCard(i)}>
                <CardFace card={card} variant="hand" playable={myTurn && id !== "hidden" && card.cost <= me.mana} />
              </div>
            );
          })}
        </div>

        <div className="sidePanel">
          {!tutorial && (
            <div className={`timerRow${timeLeft <= 10 && myTurn ? " urgent" : ""}`} data-testid="turn-timer">
              <span className="timerText">
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
              </span>
              <span className="timerBar">
                <span className="timerFill" style={{ width: `${Math.min(100, (timeLeft / turnMax) * 100)}%` }} />
              </span>
            </div>
          )}
          <button className="endTurnBtn" data-testid="end-turn" disabled={!myTurn}
            onClick={() => void doPlayerAction({ type: "END_TURN" })}>
            {busy ? "…" : myTurn ? "End Turn" : "Enemy Turn"}
          </button>
        </div>
      </div>

      {/* dragged card ghost */}
      {drag && (
        <div className="dragGhost" style={{ left: drag.x, top: drag.y }}>
          <CardFace card={getCardSafe(me.hand[drag.index])} variant="hand" />
        </div>
      )}
      {bursts.map((b) => (
        <div key={b.key} className="dropBurst" style={{ left: b.x, top: b.y }} />
      ))}
      {sprites.map((f) => (
        <img key={f.key} src={`/fx/${f.kind}.jpg`} alt="" className={`fxSprite fx-${f.kind}`}
          style={{ left: f.x, top: f.y, width: f.s, height: f.s }} />
      ))}
      {flyers.map((f) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={f.key} src="/cards/back.jpg" alt="" className="cardFlyer"
          style={{ left: f.x, top: f.y, "--fx": `${f.dx}px`, "--fy": `${f.dy}px` } as React.CSSProperties} />
      ))}
      {bolts.map((b) => (
        <span key={b.key} className="fxBolt"
          style={{ left: b.x, top: b.y, "--bx": `${b.dx}px`, "--by": `${b.dy}px`, "--hue": b.hue } as React.CSSProperties} />
      ))}

      {/* targeting arrow */}
      {(selAttacker !== null || selCard !== null) && (
        <svg className="targetArrow">
          <defs>
            <marker id="arrowHead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#e3a44a" />
            </marker>
          </defs>
          <path ref={arrowRef} className="targetArrowPath" d="M 0 0" markerEnd="url(#arrowHead)" />
          <circle className="targetReticle" cx="-40" cy="-40" r="17" />
        </svg>
      )}

      {/* hover popup — beside enemy units, above your own cards */}
      {zoomCard && zoomDef && !busy && !drag && (() => {
        const vw = typeof window !== "undefined" ? window.innerWidth : 1500;
        const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
        const beside = zoomCard.src === "board";
        const style: React.CSSProperties = beside
          ? {
              // sit beside the unit so the battlefield stays visible
              left: zoomCard.x < vw / 2 ? zoomCard.x + 250 : zoomCard.x - 250,
              top: Math.max(215, Math.min(zoomCard.y, vh - 215)),
              transform: "translate(-50%, -50%)",
            }
          : {
              left: Math.min(Math.max(zoomCard.x, 170), vw - 170),
              top: zoomCard.y - 150,
              transform: "translate(-50%, -100%)",
            };
        return (
          <div className={`zoomPop${beside ? " besideUnit" : ""}`} style={style}>
            {FRAMED_FACTIONS.has(zoomDef.faction)
              ? <FramedCard card={zoomDef} width={300} />
              : <div className="zoomFallback"><CardFace card={zoomDef} /></div>}
          </div>
        );
      })()}

      {/* opponent card reveal */}
      {reveal && revealDef && (
        <div className="revealWrap">
          {FRAMED_FACTIONS.has(revealDef.faction)
            ? <FramedCard card={revealDef} width={320} />
            : <div className="zoomFallback"><CardFace card={revealDef} /></div>}
        </div>
      )}

      {/* big center countdown for the last 10 seconds */}
      {myTurn && !tutorial && timeLeft <= 10 && timeLeft > 0 && (
        <div className="bigCountdown" key={timeLeft}>{timeLeft}</div>
      )}

      {connLost && !ended && (
        <div className="playToast" data-testid="conn-banner" style={{ top: 12, bottom: "auto" }}>
          <span>Connection lost — retrying…</span>
        </div>
      )}

      {banner && <div className="turnBanner">{banner}</div>}
      {toast && (
        <div className="playToast">
          <img src="/ui/mana.png" alt="" />
          <span>{toast}</span>
        </div>
      )}

      {tutorial && game.winner === null && !ended && (
        <TutorialOverlay game={game} step={tutStep} setStep={setTutStep} myTurn={myTurn} />
      )}

      {/* campaign matches get the star/reward ceremony; everything else the generic plate */}
      {ended && ended.stars !== undefined && (
        <CampaignRewards
          won={ended.won}
          nodeId={ended.nodeId}
          nodeName={ended.nodeName}
          chapter={ended.chapter}
          chapterName={ended.chapterName}
          stars={ended.stars}
          bestStars={ended.bestStars}
          starDetails={ended.starDetails}
          gold={ended.gold}
          shards={ended.shards}
          xp={ended.xp}
          levelUps={ended.levelUps}
          packs={ended.packs ?? (ended.pack ? [ended.pack] : undefined)}
          card={ended.card}
          firstClear={ended.firstClear}
          chapterComplete={ended.chapterComplete}
          onContinue={() => router.push("/campaign")}
          onMenu={() => router.push("/")}
        />
      )}

      {ended && ended.stars === undefined && (
        <div className="endOverlay" data-testid="end-overlay">
          <div className="endCardPanel">
            <h1 className={ended.won ? "vic" : "def"}>{ended.won ? "Victory" : "Defeat"}</h1>
            {!ended.noReward && (
              <p className="endRewards">
                +{ended.gold} <img src="/ui/gold.png" alt="gold" /> · +{ended.xp} XP
                {ended.levelUps > 0 && <span className="levelUp"> · Level up! +{ended.levelUps} pack</span>}
              </p>
            )}
            {ended.ratingDelta !== undefined && (
              <p className={`endRating ${ended.ratingDelta >= 0 ? "up" : "down"}`} data-testid="rating-delta">
                {ended.ratingDelta >= 0 ? "▲" : "▼"} {Math.abs(ended.ratingDelta)} rating
                · {ended.rating}{" "}
                <span className={`leagueBadge l-${ended.league}`}>
                  <img className="leagueCrestSm" src={`/ui/leagues/${(ended.league ?? "bronze").toLowerCase()}.png`} alt="" />
                  {ended.league}
                </span>
              </p>
            )}
            {ended.pack && (
              <p className="endPackDrop" data-testid="pack-drop">
                {ended.firstClear ? "First clear!" : ""} +1 {ended.pack} pack
                <img src={`/store/pack-${ended.pack}.png`} alt="" />
              </p>
            )}
            <div className="endBtns">
              {!online && <button className="btn primary" onClick={() => window.location.reload()}>Play Again</button>}
              {online && ended.ratingDelta !== undefined && (
                <button className="btn primary" onClick={() => router.push("/?queue=1")}>Queue Again</button>
              )}
              <button className="btn" onClick={() => router.push("/")}>Main Menu</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
  /* eslint-enable @next/next/no-img-element */
}
