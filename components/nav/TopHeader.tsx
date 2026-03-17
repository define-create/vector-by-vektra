"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SCREEN_NAMES: Record<string, string> = {
  "/command": " ",
  "/enter": " ",
  "/stats": " ",
};

export default function TopHeader() {
  const pathname = usePathname();

  // Match on the first path segment (e.g. "/stats/..." → "/stats")
  const segment = "/" + (pathname.split("/")[1] ?? "");
  const screenName = SCREEN_NAMES[segment] ?? "";

  return (
    <header className="pt-safe-top fixed left-0 right-0 top-0 z-40 border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-5">
        {/* Left: logo + wordmark */}
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-base font-bold text-zinc-50">Vector</span>
        </div>

        {/* Center: screen name */}
        <span className="text-sm font-medium text-zinc-400">{screenName}</span>

        {/* Right: profile/settings link */}
        <Link href="/profile" aria-label="Settings">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-zinc-400"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
