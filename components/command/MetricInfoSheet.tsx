"use client";

import { useState } from "react";

export interface MetricInfo {
  label: string;
  body: string;
}

interface Props {
  metric: MetricInfo;
}

/**
 * Renders an ⓘ icon button that slides up a bottom sheet with a plain-English
 * explanation of the metric. Self-contained client island — no state leak upward.
 */
export function MetricInfoSheet({ metric }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`About ${metric.label}`}
        className="text-zinc-500 hover:text-zinc-300 transition-colors leading-none"
      >
        ⓘ
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Bottom sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-700 rounded-t-2xl px-6 pt-5 pb-24 transition-transform duration-200 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={metric.label}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-700" />

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-widest">
            {metric.label}
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-zinc-400 leading-relaxed">{metric.body}</p>
      </div>
    </>
  );
}
