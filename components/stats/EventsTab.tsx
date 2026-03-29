"use client";

import { useState } from "react";
import { TagSelector } from "@/components/events/TagSelector";
import { Podium } from "@/components/events/Podium";
import { LeaderboardTable } from "@/components/events/LeaderboardTable";
import { EventMatchList } from "@/components/events/EventMatchList";
import { type EventData } from "@/lib/services/events";

interface EventsTabProps {
  initialTags: string[];
}

export default function EventsTab({ initialTags }: EventsTabProps) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch(`/api/events?tag=${encodeURIComponent(tag)}`);
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to load event data");
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
    <div className="flex flex-col gap-8 p-5 pb-24">
      {/* Tag selector — uses server-provided tags, no fetch */}
      <TagSelector value={selectedTag} onChange={loadTag} tags={initialTags} />

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

      {/* Event content */}
      {data && !loading && (
        <div className="flex flex-col gap-8">
          {data.matches.length > 0 && (
            <Podium top3={data.leaderboard.slice(0, 3)} />
          )}
          <LeaderboardTable players={data.leaderboard} />
          <EventMatchList matches={data.matches} />
        </div>
      )}
    </div>
  );
}
