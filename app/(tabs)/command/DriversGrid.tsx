import { getCommandData, type CommandFilter } from "@/lib/services/command";
import { DriverTile } from "@/components/command/DriverTile";
import { METRIC_INFO, pct, signedFixed, ciToFormState } from "./helpers";

export default async function DriversGrid({
  userId,
  filter,
}: {
  userId: string;
  filter?: CommandFilter;
}) {
  const data = await getCommandData(userId, filter);
  const formState = ciToFormState(data.compoundingIndex);

  return (
    <div className="px-5 pb-3">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-500 mb-2">Key Drivers</p>
      <div className="grid grid-cols-3 gap-2">
        <DriverTile
          label="Win Rate"
          value={pct(data.winPct, 0)}
          delta={data.driverDeltas.winRateDelta !== null ? data.driverDeltas.winRateDelta * 100 : null}
          deltaUnit="%"
          history={data.driverHistory.winRateHistory}
          highlighted={data.dominantDriver === "winRate"}
          info={METRIC_INFO.winPct}
        />
        <DriverTile
          label="Form"
          value={formState.label}
          valueColor={formState.colorClass}
          secondaryValue={signedFixed(data.compoundingIndex)}
          delta={data.driverDeltas.ciDelta}
          history={data.driverHistory.ciHistory}
          highlighted={data.dominantDriver === "ci"}
          info={METRIC_INFO.ci}
        />
        <DriverTile
          label="Stability"
          value={signedFixed(data.driftScore)}
          delta={data.driverDeltas.driftDelta}
          history={data.driverHistory.driftHistory}
          highlighted={data.dominantDriver === "drift"}
          info={METRIC_INFO.drift}
        />
      </div>
    </div>
  );
}
