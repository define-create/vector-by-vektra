"use client";

import { useState, useEffect } from "react";
import { TagSelector } from "@/components/events/TagSelector";
import { Podium } from "@/components/events/Podium";
import { LeaderboardTable } from "@/components/events/LeaderboardTable";
import { EventMatchList } from "@/components/events/EventMatchList";
import { type EventData } from "@/lib/services/events";

export default function TournamentPage() {
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/tags")
      .then((r) => r.json())
      .then((d: { tags: { tag: string }[] }) =>
        setAllTags(d.tags?.map((t) => t.tag) ?? []),
      )
      .catch(() => {});
  }, []);

  async function loadTag(tag: string) {
    if (!tag) {
      setSelectedTag(null);
      setData(null);
      return;
    }
    setSelectedTag(tag);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/tournament?tag=${encodeURIComponent(tag)}`,
      );
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to load tournament data");
        setData(null);
      } else {
        const json = (await res.json()) as EventData;
        setData(json);
      }
    } catch {
      setError("Network error — please try again");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50 mb-1">Tournament</h1>
        <p className="text-sm text-zinc-500">
          Select an event tag to view standings and match results.
        </p>
      </div>

      {/* Tag selector */}
      <TagSelector value={selectedTag} onChange={loadTag} tags={allTags} />

      {/* Empty state */}
      {!selectedTag && (
        <p className="text-sm text-zinc-500 italic">
          Select an event to view results.
        </p>
      )}

      {/* Loading */}
      {selectedTag && loading && (
        <p className="text-sm text-zinc-400">Loading…</p>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-rose-400">{error}</p>
      )}

      {/* Tournament content */}
      {data && !loading && (
        <div className="flex flex-col gap-8">
          {/* Podium — only when at least one match */}
          {data.matches.length > 0 && (
            <Podium top3={data.leaderboard.slice(0, 3)} />
          )}

          {/* Leaderboard */}
          <LeaderboardTable players={data.leaderboard} />

          {/* Match list — full-page scroll, no nested widget */}
          <EventMatchList matches={data.matches} />
        </div>
      )}
    </div>
  );
}
