import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { PNG } from "pngjs";
import * as jpeg from "jpeg-js";
import { findSlot, projectRoot, publicFile } from "@/lib/studio";

export const dynamic = "force-dynamic";

/** Flood-fill the contiguous near-black window from a center seed and make it transparent. */
function knockoutWindow(png: PNG): PNG {
  const { width: w, height: h, data } = png;
  const idx = (x: number, y: number) => (y * w + x) * 4;
  const dark = (i: number) => data[i] < 46 && data[i + 1] < 46 && data[i + 2] < 46;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const sx = w >> 1;
  const sy = Math.floor(h * 0.25);
  if (!dark(idx(sx, sy))) return png;
  stack.push(sx, sy);
  while (stack.length) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const flat = y * w + x;
    if (seen[flat]) continue;
    seen[flat] = 1;
    const i = idx(x, y);
    if (!dark(i)) continue;
    data[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return png;
}

export async function POST(req: Request) {
  const { slotId, image } = (await req.json()) as { slotId: string; image: string };
  const slot = findSlot(slotId);
  if (!slot) return NextResponse.json({ error: "Unknown slot" }, { status: 400 });
  const m = image?.match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (!m) return NextResponse.json({ error: "Expected a data:image/png|jpeg;base64 payload" }, { status: 400 });
  const buf = Buffer.from(m[2], "base64");

  const target = publicFile(slot);
  const backupDir = path.join(projectRoot(), "public", "cards", ".backups");
  await fs.mkdir(backupDir, { recursive: true });
  try {
    const prev = await fs.readFile(target);
    await fs.writeFile(
      path.join(backupDir, `${slot.id}-${Date.now()}${path.extname(target)}`),
      prev,
    );
  } catch {
    /* no existing file to back up */
  }

  let rgba: { data: Buffer | Uint8Array; width: number; height: number };
  if (m[1] === "png") {
    rgba = PNG.sync.read(buf);
  } else {
    const d = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 1024 });
    rgba = { data: d.data, width: d.width, height: d.height };
  }

  if (target.endsWith(".png")) {
    let png = new PNG({ width: rgba.width, height: rgba.height });
    png.data = Buffer.from(rgba.data as Uint8Array);
    if (slot.kind === "frame") png = knockoutWindow(png);
    await fs.writeFile(target, PNG.sync.write(png));
  } else {
    const encoded = jpeg.encode(
      { data: Buffer.from(rgba.data as Uint8Array), width: rgba.width, height: rgba.height },
      86,
    );
    await fs.writeFile(target, encoded.data);
  }

  return NextResponse.json({ ok: true, saved: `/${slot.publicPath}` });
}
