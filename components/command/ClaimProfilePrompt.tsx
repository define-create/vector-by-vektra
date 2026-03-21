"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Player {
  id: string;
  displayName: string;
  rating: number;
  matchCount?: number;
  lastMatchDate?: string | null;
  winPct?: number | null;
}

interface Props {
  emailVerified: boolean;
  userDisplayName: string;
  userEmail?: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const card = "rounded-xl border border-zinc-700 bg-zinc-800/60 px-5 py-5 flex flex-col gap-3";
const label = "text-xs font-medium uppercase tracking-widest text-zinc-500";
const body = "text-sm text-zinc-400 leading-relaxed";

// ---------------------------------------------------------------------------
// State A — email not verified
// ---------------------------------------------------------------------------

function UnverifiedState({ userEmail }: { userEmail?: string }) {
  const [email, setEmail] = useState(userEmail ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResendError(null);
    setSending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setResendError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setResendError("Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 pt-12">
      <div className={card}>
        <p className="text-sm text-zinc-300 leading-relaxed">
          Your stats will appear here once your profile is set up.
          To proceed, verify your email — check your inbox before continuing.
        </p>
      </div>

      <div className={card}>
        <p className={label}>Verify Your Email</p>
        <p className={body}>
          We sent a verification link when you registered. Check your inbox and
          click the link, then return here to set up your profile.
        </p>

        {sent ? (
          <p className="text-sm text-zinc-300">Check your inbox for a new verification link.</p>
        ) : (
          <form onSubmit={handleResend} className="flex flex-col gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setResendError(null); }}
              placeholder="Your email…"
              required
              className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none text-sm"
            />
            {resendError && <p className="text-sm text-red-400">{resendError}</p>}
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-lg bg-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Resend verification email"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function formatLastPlayed(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return `Last played ${d.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
}

// ---------------------------------------------------------------------------
// State B — email verified
// ---------------------------------------------------------------------------

export function ClaimProfilePrompt({ emailVerified, userDisplayName, userEmail }: Props) {
  const router = useRouter();

  // Card 2 — search / claim
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const searchGenRef = useRef(0);
  const debouncedQuery = useDebounce(query, 250);

  // Card 3 — start fresh
  const [displayName, setDisplayName] = useState(userDisplayName);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [warningProfiles, setWarningProfiles] = useState<Player[]>([]);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const debouncedDisplayName = useDebounce(displayName, 400);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }
    searchGenRef.current += 1;
    const myGen = searchGenRef.current;
    setSearching(true);
    fetch(`/api/players/search?q=${encodeURIComponent(debouncedQuery)}&unclaimed=true&includeStats=true`)
      .then((r) => r.json())
      .then((data: { players: Player[] }) => {
        if (myGen !== searchGenRef.current) return;
        setResults(data.players ?? []);
      })
      .catch(() => {
        if (myGen !== searchGenRef.current) return;
        setResults([]);
      })
      .finally(() => {
        if (myGen !== searchGenRef.current) return;
        setSearching(false);
      });
  }, [debouncedQuery]);

  // Warning: watch Card 3 display name for similar unclaimed profiles
  useEffect(() => {
    if (!debouncedDisplayName.trim()) {
      setWarningProfiles([]);
      return;
    }
    fetch(
      `/api/players/search?q=${encodeURIComponent(debouncedDisplayName)}&unclaimed=true&includeStats=true`,
    )
      .then((r) => r.json())
      .then((data: { players: Player[] }) => setWarningProfiles(data.players ?? []))
      .catch(() => setWarningProfiles([]));
  }, [debouncedDisplayName]);

  async function handleClaim(playerId: string) {
    setClaimingId(playerId);
    setClaimError(null);
    try {
      const res = await fetch(`/api/players/${playerId}/claim`, { method: "POST" });
      if (res.ok) { router.push("/command"); return; }
      const body = await res.json().catch(() => ({})) as { error?: string };
      setClaimError(body.error ?? "Unable to claim — please try again.");
    } catch {
      setClaimError("Network error. Please try again.");
    } finally {
      setClaimingId(null);
    }
  }

  async function handleCreate() {
    const name = displayName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      if (res.ok) { router.push("/command"); return; }
      const data = await res.json().catch(() => ({})) as { error?: string };
      setCreateError(data.error ?? "Unable to create profile — please try again.");
    } catch {
      setCreateError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  if (!emailVerified) return <UnverifiedState userEmail={userEmail} />;

  return (
    <div className="flex flex-col gap-4 pt-10">
      {/* Page header — outside any card */}
      <div className="pb-1">
        <h2 className="text-lg font-semibold text-zinc-100">Set up your profile</h2>
        <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
          If you&apos;ve played in any tracked matches, your stats are already recorded.
        </p>
      </div>

      {/* Card 1 — find your stats (primary) */}
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-8 h-8 rounded-full bg-zinc-200 text-zinc-900 flex items-center justify-center font-bold text-sm mt-0.5">
            1
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 leading-snug">Already played here</h3>
            <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">Find your stats from past matches</p>
          </div>
        </div>

        <div className="border-t border-zinc-700/50 pt-3 flex flex-col gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setClaimError(null); }}
            placeholder="Type your (nick) name…"
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none text-sm"
          />
          {searching && <p className="text-sm text-zinc-500">Searching…</p>}
          {!searching && debouncedQuery.trim() && results.length === 0 && (
            <p className="text-sm text-zinc-500">No unclaimed profiles found.</p>
          )}
          {!searching && results.length > 0 && (
            <ul className="flex flex-col gap-2">
              {results.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{p.displayName}</p>
                    <p className="text-xs text-zinc-500">
                      {p.matchCount != null
                        ? p.matchCount === 0
                          ? "No matches yet"
                          : `${p.matchCount} match${p.matchCount === 1 ? "" : "es"}`
                        : `${Math.round(p.rating)} rating`}
                      {p.lastMatchDate ? ` · ${formatLastPlayed(p.lastMatchDate)}` : ""}
                      {p.winPct != null ? ` · ${Math.round(p.winPct * 100)}% wins` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClaim(p.id)}
                    disabled={claimingId === p.id}
                    className="rounded-lg bg-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-500 active:bg-zinc-400 disabled:opacity-50 transition-colors"
                  >
                    {claimingId === p.id ? "Claiming…" : "This is me"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {claimError && <p className="text-sm text-amber-400">{claimError}</p>}
        </div>
      </div>

      {/* Divider — amber glow pill */}
      <div className="flex items-center gap-0">
        <div className="flex-1 border-t border-zinc-600" />
        <span
          className="mx-3 border border-amber-500/60 bg-amber-950/60 text-amber-300 text-xs font-bold tracking-widest rounded-full px-5 py-2 shrink-0"
          style={{ boxShadow: "0 0 12px 0 rgba(180, 100, 0, 0.25)" }}
        >OR</span>
        <div className="flex-1 border-t border-zinc-600" />
      </div>

      {/* Card 2 — new here (same treatment as Card 1) */}
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-8 h-8 rounded-full bg-zinc-200 text-zinc-900 flex items-center justify-center font-bold text-sm mt-0.5">
            2
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 leading-snug">New here</h3>
            <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">Haven&apos;t played in any tracked matches yet? Create a fresh profile.</p>
          </div>
        </div>

        <div className="border-t border-zinc-700/50 pt-3 flex flex-col gap-3">
          <input
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setCreateError(null);
              setWarningDismissed(false);
            }}
            placeholder="Your display name…"
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none text-sm"
          />

          {/* Warning — similar unclaimed profiles found */}
          {warningProfiles.length > 0 && !warningDismissed && (
            <div className="rounded-xl border border-amber-800/60 bg-amber-900/10 p-4 flex flex-col gap-3">
              <p className="text-sm text-amber-300">
                We found profiles with similar names. Are you sure none of these are you?
              </p>
              <ul className="flex flex-col gap-2">
                {warningProfiles.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-zinc-200">{p.displayName}</p>
                      <p className="text-xs text-zinc-500">
                        {p.matchCount != null
                          ? p.matchCount === 0
                            ? "No matches yet"
                            : `${p.matchCount} match${p.matchCount === 1 ? "" : "es"}`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleClaim(p.id)}
                      disabled={claimingId === p.id}
                      className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
                    >
                      {claimingId === p.id ? "Claiming…" : "This is me"}
                    </button>
                  </li>
                ))}
              </ul>
              {claimError && (
                <p className="text-sm text-amber-400">{claimError}</p>
              )}
              <button
                type="button"
                onClick={() => setWarningDismissed(true)}
                className="self-start text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
              >
                None of these are me — create fresh profile
              </button>
            </div>
          )}

          {/* Show create button only when no warning or warning dismissed */}
          {(warningProfiles.length === 0 || warningDismissed) && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !displayName.trim()}
              className="w-full rounded-lg bg-zinc-700 px-4 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-600 active:bg-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? "Creating…" : "Create Profile"}
            </button>
          )}
          {createError && <p className="text-sm text-amber-400">{createError}</p>}
        </div>
      </div>
    </div>
  );
}
