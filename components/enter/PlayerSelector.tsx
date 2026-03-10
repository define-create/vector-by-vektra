"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Player {
  id: string;
  displayName: string;
  rating: number;
  claimed: boolean;
  matchCount: number;
}

interface PlayerSelectorProps {
  label: string;
  value: { id?: string; name?: string } | null;
  onChange: (value: { id?: string; name?: string } | null) => void;
  /** Players to show as chips before user types anything */
  recentPlayers?: Player[];
  /** IDs of players already selected elsewhere (excluded from results) */
  excludeIds?: string[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function PlayerSelector({
  label,
  value,
  onChange,
  recentPlayers = [],
  excludeIds = [],
}: PlayerSelectorProps) {
  const [inputValue, setInputValue] = useState(
    value?.name ?? "",
  );
  const [results, setResults] = useState<Player[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipNextSearchRef = useRef(value?.id != null);
  const isSelectedRef = useRef(value?.id != null);
  const searchGenRef = useRef(0);

  const debouncedInput = useDebounce(inputValue, 250);

  // Fetch search results when input changes
  useEffect(() => {
    if (!debouncedInput || debouncedInput.length < 1) {
      skipNextSearchRef.current = false;
      setResults([]);
      setOpen(false);
      return;
    }

    // Slot already has a confirmed player — don't re-search on excludeIds changes
    if (isSelectedRef.current) return;

    // Skip re-search triggered by selectPlayer setting inputValue
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    searchGenRef.current += 1;
    const myGen = searchGenRef.current;
    setLoading(true);

    fetch(`/api/players/search?q=${encodeURIComponent(debouncedInput)}`)
      .then((r) => r.json())
      .then((data: { players: Player[] }) => {
        if (myGen !== searchGenRef.current) return;
        setResults(
          (data.players ?? []).filter((p) => !excludeIds.includes(p.id)),
        );
        setOpen(true);
      })
      .catch(() => {
        if (myGen !== searchGenRef.current) return;
        setResults([]);
      })
      .finally(() => {
        if (myGen !== searchGenRef.current) return;
        setLoading(false);
      });
  }, [debouncedInput, excludeIds]);

  // Close dropdown on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const selectPlayer = useCallback(
    (player: Player) => {
      searchGenRef.current += 1;        // invalidate any in-flight fetch
      skipNextSearchRef.current = true; // block next debounce-triggered search
      isSelectedRef.current = true;     // block excludeIds-triggered re-searches
      setResults([]);                   // clear stale results immediately
      setInputValue(player.displayName);
      onChange({ id: player.id, name: player.displayName });
      setOpen(false);
    },
    [onChange],
  );

  const clearSelection = useCallback(() => {
    isSelectedRef.current = false;
    setInputValue("");
    onChange(null);
    setResults([]);
    setOpen(false);
  }, [onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isSelectedRef.current = false;
    const v = e.target.value;
    setInputValue(v);
    // If the user types, clear any previously resolved ID (now it's a name-only entry)
    onChange(v.trim() ? { name: v.trim() } : null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const visibleRecent = recentPlayers.filter(
    (p) => !excludeIds.includes(p.id) && p.id !== value?.id,
  );

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <label className="text-base font-medium text-zinc-400">{label}</label>

      {/* Recent player chips */}
      {visibleRecent.length > 0 && !value && (
        <div className="flex flex-wrap gap-2">
          {visibleRecent.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectPlayer(p)}
              className="rounded-full bg-zinc-700 px-3 py-1 text-base text-zinc-200 hover:bg-zinc-600 active:bg-zinc-500"
            >
              {p.displayName}
            </button>
          ))}
        </div>
      )}

      {/* Text input */}
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder="Search or type a name…"
          className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none"
        />

        {value?.id && (
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selection"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
          >
            ✕
          </button>
        )}

        {/* Search results dropdown */}
        {open && (
          <ul className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 py-1 shadow-lg">
            {loading && (
              <li className="px-4 py-2 text-sm text-zinc-400">Searching…</li>
            )}
            {!loading && results.length === 0 && (
              <li className="px-4 py-2 text-sm text-zinc-400">
                No match — will create a shadow profile for "{inputValue}"
              </li>
            )}
            {!loading &&
              results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => selectPlayer(p)}
                    className="flex w-full items-center justify-between px-4 py-2 text-left text-base text-zinc-200 hover:bg-zinc-700"
                  >
                    <span className="flex flex-col">
                      <span>{p.displayName}</span>
                      <span className="text-xs text-zinc-500">
                        {p.matchCount > 0 ? `${p.matchCount} matches` : "No matches yet"}
                      </span>
                    </span>
                    <span className="text-sm text-zinc-500">{Math.round(p.rating)}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* Selected player indicator */}
      {value?.id && (() => {
        const sel = results.find((p) => p.id === value.id) ?? recentPlayers.find((p) => p.id === value.id);
        return (
          <p className="text-sm text-emerald-400">
            ✓ {value.name}
            {sel ? ` · Rating ${Math.round(sel.rating)} · ${sel.matchCount > 0 ? `${sel.matchCount} matches` : "No matches yet"}` : ""}
          </p>
        );
      })()}
      {value && !value.id && value.name && (
        <p className="text-sm text-amber-400">New player — shadow profile will be created</p>
      )}
    </div>
  );
}
