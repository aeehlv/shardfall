import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { STUDIO_SLOTS, projectRoot } from "@/lib/studio";

export const dynamic = "force-dynamic";

async function promptSeed(promptFile?: string, fallback?: string): Promise<string> {
  if (promptFile) {
    try {
      const md = await fs.readFile(path.join(projectRoot(), promptFile), "utf8");
      const m = md.match(/##\s*(?:Art Prompt|ART PROMPT)[^\n]*\n+([\s\S]*?)(?=\n##|\n\*\*|$)/i);
      if (m) return m[1].trim();
    } catch {
      /* fall through to fallback */
    }
  }
  return fallback ?? "";
}

export async function GET() {
  const slots = await Promise.all(
    STUDIO_SLOTS.map(async (s) => ({
      id: s.id,
      label: s.label,
      kind: s.kind,
      url: `/${s.publicPath}`,
      prompt: await promptSeed(s.promptFile, s.defaultPrompt),
    })),
  );
  return NextResponse.json({ slots });
}
