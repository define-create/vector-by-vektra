"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  token: string;
  playerName: string;
}

export default function InviteClaimButton({ token, playerName }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClaim() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/${token}/claim`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to claim profile. Please try again.");
        return;
      }
      // Clear pending invite token from localStorage
      if (typeof window !== "undefined") {
        localStorage.removeItem("pendingInviteToken");
      }
      router.push("/command");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClaim}
        disabled={loading}
        className="w-full bg-zinc-50 text-zinc-900 font-semibold text-sm py-4 rounded-xl hover:bg-white transition-colors disabled:opacity-60"
      >
        {loading ? "Claiming…" : `Claim ${playerName}'s profile →`}
      </button>
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
    </div>
  );
}
