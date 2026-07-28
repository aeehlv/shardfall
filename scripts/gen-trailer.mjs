/** Generate the Shardfall world trailer with Veo 3.1 (1080p, native audio),
 *  then stitch the shots into one film. Run: node scripts/gen-trailer.mjs */

import { experimental_generateVideo as generateVideo, createGateway } from "ai";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public/video");
const RAW = path.join(ROOT, "library/art/history/trailer");
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const MODEL = "google/veo-3.1-generate-001";

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

const apiKey = /AI_GATEWAY_API_KEY=(\S+)/.exec(fs.readFileSync(path.join(ROOT, ".env"), "utf8"))[1];

// NOTE: a custom undici Agent dispatcher breaks the gateway's video responses —
// the default fetch handles the ~2 min generations fine.
const gateway = createGateway({ apiKey });

const LOOK =
  "Painterly high-fantasy cinematic, epic scale, dramatic volumetric light, rich saturated color, " +
  "film grain, slow deliberate camera move, no on-screen text, no subtitles, no logos.";

const SHOTS = [
  {
    id: "01-undersun",
    prompt:
      "Slow push-in through a peaceful medieval valley at dawn; beneath the earth a colossal buried " +
      "crystalline star glows warm gold, its light seeping up through soil and rock into sleeping " +
      "fields and a distant walled city. Then the ground trembles and hairline cracks of light race " +
      "across the meadow. Ambient wind, a deep resonant hum rising. " + LOOK,
  },
  {
    id: "02-shattering",
    prompt:
      "Wide shot: the buried crystal star bursts. A titanic column of golden light and crystal shrapnel " +
      "erupts through the ground and splits the sky, shockwave rings racing outward, mountains cracking, " +
      "clouds torn into an aurora. Camera slowly pulls back from the blast. Thunderous impact, low " +
      "rumbling roar, ringing crystal tones. " + LOOK,
  },
  {
    id: "03-falling",
    prompt:
      "Night in a ruined countryside. Glowing crystal shards drift down from an aurora-torn sky like " +
      "slow snow. Villagers and children in worn cloaks look up in awe, one child reaching a hand toward " +
      "a shard, warm light on their faces. Gentle camera rise. Soft wind, distant chiming, a child's " +
      "quiet gasp, faint choral voices. " + LOOK,
  },
  {
    id: "04-nations",
    prompt:
      "Three rapid establishing shots of rival powers claiming the shards: bronze-armored legions " +
      "marching through a volcanic forge-city of lava rivers and colossal anvils; robed singers floating " +
      "between bioluminescent teal coral spires of a drowned cathedral-city; and beast-kin druids in a " +
      "living forest-city of golden-lit heartwood trees tending glowing seeds. Camera glides between them. " +
      "War drums, deep choral chanting, forge hammers. " + LOOK,
  },
  {
    id: "05-war-heartwound",
    prompt:
      "Three armies clash on a shattered plain beneath floating crystal shards — fire legions, coral " +
      "singers, and wooden-armored beast-kin — banners whipping, dust and light. The camera rises above " +
      "the battle and cranes toward an immense crater on the horizon ringed by tower-sized frozen shards " +
      "of light, where a lone armored duelist stands at the rim. Battle roar fading into a single held " +
      "choral note. " + LOOK,
  },
];

async function shot(s, i) {
  const file = path.join(RAW, `${s.id}.mp4`);
  if (fs.existsSync(file) && fs.statSync(file).size > 100_000) {
    console.log(`skip  ${s.id} (already generated)`);
    return file;
  }
  const t0 = Date.now();
  console.log(`start ${s.id} …`);
  const { videos, warnings } = await generateVideo({
    model: gateway.video(MODEL),
    prompt: s.prompt,
    duration: 8,
    aspectRatio: "16:9",
    generateAudio: true,
  });
  if (warnings?.length) console.log(`      warnings: ${JSON.stringify(warnings).slice(0, 200)}`);
  fs.writeFileSync(file, videos[0].uint8Array);
  console.log(`OK    ${s.id}  ${(fs.statSync(file).size / 1e6).toFixed(1)} MB  ${(Date.now() - t0) / 1000 | 0}s`);
  return file;
}

const files = [];
for (const [i, s] of SHOTS.entries()) {
  try {
    files.push(await shot(s, i));
  } catch (e) {
    console.error(`FAIL  ${s.id}: ${String(e).slice(0, 300)}`);
  }
}

if (files.length) {
  // stitch with short crossfade-free concat (re-encode for uniform params)
  const listFile = path.join(RAW, "list.txt");
  fs.writeFileSync(listFile, files.map((f) => `file '${f}'`).join("\n"));
  const out = path.join(OUT, "shardfall-world.mp4");
  const res = spawnSync(FFMPEG, [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile,
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out,
  ], { stdio: ["ignore", "inherit", "inherit"] });
  if (res.status === 0) {
    const probe = spawnSync("/opt/homebrew/bin/ffprobe", [
      "-v", "error", "-show_entries", "format=duration,size", "-of", "default=nw=1", out,
    ], { encoding: "utf8" });
    console.log(`\nTRAILER → ${out}\n${probe.stdout}`);
  } else {
    console.error("stitch failed");
  }
}
