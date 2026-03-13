"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/sign-in" })}
      className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
    >
      Sign Out
    </button>
  );
}
