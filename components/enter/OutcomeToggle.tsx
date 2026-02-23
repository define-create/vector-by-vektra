"use client";

interface OutcomeToggleProps {
  value: "win" | "loss" | null;
  onChange: (value: "win" | "loss") => void;
}

export default function OutcomeToggle({ value, onChange }: OutcomeToggleProps) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium text-zinc-400">Outcome</label>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange("win")}
          className={[
            "rounded-xl py-5 text-xl font-bold tracking-wide transition-colors",
            value === "win"
              ? "bg-emerald-500 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
          ].join(" ")}
        >
          WIN
        </button>
        <button
          type="button"
          onClick={() => onChange("loss")}
          className={[
            "rounded-xl py-5 text-xl font-bold tracking-wide transition-colors",
            value === "loss"
              ? "bg-rose-500 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
          ].join(" ")}
        >
          LOSS
        </button>
      </div>
    </div>
  );
}
