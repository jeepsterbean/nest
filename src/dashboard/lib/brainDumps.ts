import type { BrainDump } from "../../lib/types";

const ONE_HOUR_SECONDS = 60 * 60;

export function initialBrainDumpStart(
  dumps: BrainDump[],
  nowSeconds: number,
): number {
  const recentStart = dumps.findIndex(
    (dump) => dump.createdAt >= nowSeconds - ONE_HOUR_SECONDS,
  );
  if (recentStart === -1) return dumps.length;
  return Math.max(recentStart, dumps.length - 3);
}
