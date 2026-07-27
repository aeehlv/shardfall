import { Suspense } from "react";
import PlayClient from "./PlayClient";

export const metadata = { title: "Shardfall — Battle" };

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="playLoading">Entering Kelvarrow…</div>}>
      <PlayClient />
    </Suspense>
  );
}
