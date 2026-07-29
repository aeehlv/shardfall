import Link from "next/link";
import "@/app/legal.css";

export default function SiteFooter() {
  return (
    <footer className="siteFooter">
      <Link href="/privacy">Privacy</Link>
      <span className="sfDot" aria-hidden="true">·</span>
      <Link href="/terms">Terms</Link>
      <span className="sfDot" aria-hidden="true">·</span>
      <Link href="/refunds">Refunds</Link>
      <span className="sfDot" aria-hidden="true">·</span>
      <Link href="/account">Account</Link>
    </footer>
  );
}
