import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { findSlot, projectRoot, publicFile } from "@/lib/studio";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MODEL = "google/gemini-3.1-flash-image";

const studioDisabled = () =>
  process.env.NODE_ENV === "production" && process.env.STUDIO_ENABLED !== "1";

export async function POST(req: Request) {
  if (studioDisabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { slotId, prompt, useBase, baseImage } = (await req.json()) as {
    slotId: string;
    prompt: string;
    useBase: boolean;
    /** Optional data URI to iterate on instead of the saved current file */
    baseImage?: string;
  };
  const slot = findSlot(slotId);
  if (!slot) return NextResponse.json({ error: "Unknown slot" }, { status: 400 });
  if (!prompt?.trim()) return NextResponse.json({ error: "Empty prompt" }, { status: 400 });
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) return NextResponse.json({ error: "AI_GATEWAY_API_KEY not set" }, { status: 500 });

  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  if (useBase) {
    let url: string;
    if (baseImage) {
      if (!/^data:image\/(png|jpeg);base64,/.test(baseImage)) {
        return NextResponse.json({ error: "baseImage must be a png/jpeg data URI" }, { status: 400 });
      }
      url = baseImage;
    } else {
      const buf = await fs.readFile(publicFile(slot));
      const mime = slot.publicPath.endsWith(".png") ? "image/png" : "image/jpeg";
      url = `data:${mime};base64,${buf.toString("base64")}`;
    }
    content.push({ type: "image_url", image_url: { url } });
  }

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Gateway ${res.status}: ${text.slice(0, 300)}` }, { status: 502 });
  }
  const json = await res.json();
  const url: string | undefined = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) {
    const text: string = json?.choices?.[0]?.message?.content ?? "no image in response";
    return NextResponse.json({ error: `Model returned no image: ${String(text).slice(0, 300)}` }, { status: 502 });
  }

  // archive EVERY generation to the history folder with simple versioning
  const historyDir = path.join(projectRoot(), "library", "art", "history", slot.id);
  await fs.mkdir(historyDir, { recursive: true });
  const existing = (await fs.readdir(historyDir)).filter((f) => /^v\d+\.(png|jpg)$/.test(f));
  const ext = url.startsWith("data:image/png") ? "png" : "jpg";
  const version = `v${String(existing.length + 1).padStart(3, "0")}.${ext}`;
  await fs.writeFile(path.join(historyDir, version), Buffer.from(url.split(",", 2)[1], "base64"));

  return NextResponse.json({ image: url, history: `library/art/history/${slot.id}/${version}` });
}
