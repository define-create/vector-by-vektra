"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TrajectoryIcon = (
  <svg width="16" height="10" viewBox="0 0 16 10">
    <path
      d="M0 5 Q2 1 4 5 Q6 9 8 5 Q10 1 12 5 Q14 9 16 5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

const tabs = [
  { label: "Command", href: "/command", icon: "⌘" as React.ReactNode },
  { label: "Enter", href: "/enter", icon: "⊕" as React.ReactNode },
  { label: "Matchups", href: "/matchups", icon: "⚔" as React.ReactNode },
  { label: "Trajectory", href: "/trajectory", icon: TrajectoryIcon },
] satisfies { label: string; href: string; icon: React.ReactNode }[];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950 pb-safe">
      <div className="flex h-16 items-center justify-around">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          const isEnter = tab.href === "/enter";

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? "text-white"
                  : isEnter
                    ? "text-zinc-300 hover:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="leading-none">{tab.icon}</span>
              <span className="text-xs uppercase tracking-widest">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
