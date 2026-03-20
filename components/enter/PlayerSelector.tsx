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
  label?: string;
  value: { id?: string; name?: string; rating?: number; matchCount?: number } | null;
  onChange: (value: { id?: string; name?: string; rating?: number; matchCount?: number } | null) => void;
  /** Called when disambiguation state changes — true means "ok to proceed" */
  onDisambiguated?: (confirmed: boolean) => void;
  /** IDs of players already selected elsewhere (excluded from results) */
  excludeIds?: string[];
  /** When true, briefly flashes an emerald ring on the input to signal it was just filled */
  flashConfirm?: boolean;
  /** Called when this input receives focus — lets parent know which slot is active */
  onSlotFocus?: () => void;
}

const EMPTY_IDS: string[] = [];

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
  onDisambiguated,
  excludeIds = EMPTY_IDS,
  flashConfirm = false,
  onSlotFocus,
}: PlayerSelectorProps) {
  const [inputValue, setInputValue] = useState(
    value?.name ?? "",
  );
  const [results, setResults] = useState<Player[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matchWarning, setMatchWarning] = useState<Player[]>([]);
  const [confirmedNew, setConfirmedNew] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipNextSearchRef = useRef(value?.id != null);
  const isSelectedRef = useRef(value?.id != null);
  const searchGenRef = useRef(0);

  const debouncedInput = useDebounce(inputValue, 250);

  // Sync inputValue when parent changes value externally (chip-tap assignment or mode reset)
  useEffect(() => {
    if (value?.id && value.name && value.name !== inputValue) {
      // External assignment (e.g. chip-tap)
      skipNextSearchRef.current = true;
      isSelectedRef.current = true;
      setInputValue(value.name);
      setResults([]);
      setOpen(false);
    } else if (!value && inputValue !== "") {
      // External clear (e.g. admin mode toggle resetting all slots)
      isSelectedRef.current = false;
      setInputValue("");
      setResults([]);
      setMatchWarning([]);
      setConfirmedNew(false);
      setOpen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.id, value?.name]);

  // Flash animation triggered by parent chip-tap assignment
  useEffect(() => {
    if (!flashConfirm) {
      setFlashing(false); // cancel glow if flashSlot moved to another slot before timer fired
      return;
    }
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 600);
    return () => clearTimeout(t);
  }, [flashConfirm]);

  // Fetch search results when input changes
  useEffect(() => {
    if (!debouncedInput || debouncedInput.length < 1) {
      skipNextSearchRef.current = false;
      setResults([]);
      setMatchWarning([]);
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
        const filtered = (data.players ?? []).filter((p) => !excludeIds.includes(p.id));
        setResults(filtered);
        // Store warning candidates only for name-only entries
        if (!isSelectedRef.current) {
          setMatchWarning(filtered);
        }
        setOpen(true);
      })
      .catch(() => {
        if (myGen !== searchGenRef.current) return;
        setResults([]);
        setMatchWarning([]);
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
      setMatchWarning([]);
      setConfirmedNew(false);
      setInputValue(player.displayName);
      onChange({ id: player.id, name: player.displayName, rating: player.rating, matchCount: player.matchCount });
      setOpen(false);
      onDisambiguated?.(true);
    },
    [onChange, onDisambiguated],
  );

  const clearSelection = useCallback(() => {
    isSelectedRef.current = false;
    setInputValue("");
    onChange(null);
    setResults([]);
    setMatchWarning([]);
    setConfirmedNew(false);
    setOpen(false);
    onDisambiguated?.(true);
  }, [onChange, onDisambiguated]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isSelectedRef.current = false;
    const v = e.target.value;
    setInputValue(v);
    setMatchWarning([]);
    setConfirmedNew(false);
    // If the user types, clear any previously resolved ID (now it's a name-only entry)
    onChange(v.trim() ? { name: v.trim() } : null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleConfirmNew = () => {
    setConfirmedNew(true);
    setOpen(false);
    onDisambiguated?.(true);
  };

  // Show warning when: name-only value, results exist, user hasn't confirmed new
  const showWarning = !!(value && !value.id && value.name && matchWarning.length > 0 && !confirmedNew);
  // Suppress dropdown while warning is shown
  const showDropdown = open && !showWarning;

  return (
    <div ref={containerRef} className="flex flex-col gap-1">
      {label && <label className="text-base font-medium text-zinc-400">{label}</label>}

      {/* Text input / selected display */}
      <div className="relative">
        {value?.id ? (() => {
          const sel = results.find((p) => p.id === value.id);
          const rating = sel?.rating ?? value.rating;
          const matchCount = sel?.matchCount ?? value.matchCount;
          const meta = rating !== undefined
            ? ` · ${Math.round(rating)} · ${matchCount && matchCount > 0 ? `${matchCount} matches` : "No matches yet"}`
            : "";
          return (
            <div className={[
              "w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-3 flex items-center justify-between transition",
              flashing ? "ring-2 ring-emerald-400" : "",
            ].join(" ").trim()}>
              <div className="flex items-baseline min-w-0 flex-1">
                <span className="text-base text-zinc-50 truncate">{value.name}</span>
                {meta && <span className="text-sm text-emerald-400 shrink-0 ml-1.5">{meta}</span>}
              </div>
              <button
                type="button"
                onClick={clearSelection}
                aria-label="Clear selection"
                className="ml-2 shrink-0 text-zinc-400 hover:text-zinc-200"
              >
                ✕
              </button>
            </div>
          );
        })() : (
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (results.length > 0 && !showWarning) setOpen(true);
              onSlotFocus?.();
            }}
            placeholder="Search or type a name…"
            className={[
              "w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none transition",
              flashing ? "ring-2 ring-emerald-400" : "",
            ].join(" ").trim()}
          />
        )}

        {/* Search results dropdown */}
        {showDropdown && (
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

      {/* Disambiguation warning — existing players with same name */}
      {showWarning && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-900/10 p-4 flex flex-col gap-3">
          <p className="text-sm text-amber-300">
            Players with this name already exist — is one of them the person you mean?
          </p>
          <ul className="flex flex-col gap-2">
            {matchWarning.map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-200">{p.displayName}</p>
                  <p className="text-xs text-zinc-500">
                    {p.matchCount > 0 ? `${p.matchCount} matches` : "No matches yet"}
                    {" · "}Rating {Math.round(p.rating)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => selectPlayer(p)}
                  className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-600 active:bg-zinc-500"
                >
                  Select
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleConfirmNew}
            className="self-start text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
          >
            No, this is a new player
          </button>
        </div>
      )}

      {/* New player indicator — shown only after warning dismissed or when no conflict */}
      {value && !value.id && value.name && !showWarning && (
        <p className="text-sm text-amber-400">New player — shadow profile will be created</p>
      )}
    </div>
  );
}
