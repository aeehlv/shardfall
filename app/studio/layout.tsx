import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.STUDIO_ENABLED !== "1") notFound();
  return children;
}
