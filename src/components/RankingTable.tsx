"use client";

import { useState } from "react";
import { KINCH_EVENTS } from "@/lib/events";
import { formatResult } from "@/lib/format";
import type { RankingRow } from "@/lib/queries";

interface Props {
  rows: RankingRow[];
}

function scoreColor(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  const hue = (clamped / 100) * 130;
  const a = 0.18 + (clamped / 100) * 0.35;
  return `hsla(${hue.toFixed(0)}, 70%, 45%, ${a.toFixed(2)})`;
}

function Flag({ countryId }: { countryId: string }) {
  if (!countryId || countryId.length !== 2 || !/^[A-Za-z]{2}$/.test(countryId)) {
    return (
      <span
        aria-hidden
        className="inline-block h-4 w-6 rounded-[2px] bg-white/10"
      />
    );
  }
  const cc = countryId.toLowerCase();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/${cc}.svg`}
      width={24}
      height={18}
      alt=""
      loading="lazy"
      className="h-4 w-6 rounded-[2px] object-cover ring-1 ring-black/30"
    />
  );
}

export default function RankingTable({ rows }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/60">
        No data yet — run <code className="text-white/80">npm run compute</code>{" "}
        to populate the rankings.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="hidden sm:grid grid-cols-[3rem_1fr_6rem] px-4 py-3 text-xs uppercase tracking-wider text-white/50 border-b border-white/10">
        <div>#</div>
        <div>Country</div>
        <div className="text-right">Kinch</div>
      </div>

      <ul className="divide-y divide-white/10">
        {rows.map((r) => {
          const isOpen = expanded === r.countryId;
          return (
            <li key={r.countryId}>
              <button
                onClick={() => setExpanded(isOpen ? null : r.countryId)}
                className="w-full grid grid-cols-[3rem_1fr_6rem] items-center gap-2 px-4 py-3 text-left hover:bg-white/[0.04] transition"
              >
                <div className="text-white/70 tabular-nums">{r.rank}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Flag countryId={r.countryId} />
                    <span className="truncate font-medium">{r.countryName}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-white/50">
                    {r.continentName}
                  </div>
                </div>
                <div className="text-right tabular-nums font-semibold">
                  {r.kinchScore.toFixed(2)}
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4">
                  <div className="scrollx overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-white/50">
                          <th className="text-left pr-3 font-normal">Event</th>
                          <th className="text-right pr-3 font-normal">Result</th>
                          <th className="text-right font-normal">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {KINCH_EVENTS.map((e) => {
                          const s = r.eventScores[e.id] ?? 0;
                          const v = r.eventValues[e.id] ?? 0;
                          const isAverage = e.type === "average";
                          const display =
                            e.type === "best"
                              ? formatResult(v, e.id, false)
                              : formatResult(v, e.id, isAverage);
                          return (
                            <tr key={e.id} className="border-t border-white/5">
                              <td className="py-1.5 pr-3 text-white/80">
                                {e.longName}
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums text-white/70">
                                {display}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                <span
                                  className="inline-block min-w-[3.5rem] rounded-md px-2 py-0.5 font-medium"
                                  style={{ background: scoreColor(s) }}
                                >
                                  {s.toFixed(1)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
