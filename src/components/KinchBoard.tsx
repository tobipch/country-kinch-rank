"use client";

import { useEffect, useMemo, useState } from "react";
import { KINCH_EVENTS } from "@/lib/events";
import type { BoardRow, ContinentInfo } from "@/lib/queries";

interface Props {
  rows: BoardRow[];
  continents: ContinentInfo[];
}

/** Map a 0–100 score to one of the heat classes defined in globals.css. */
function heatClass(s: number): string {
  if (s <= 0) return "";
  return `h${Math.min(10, Math.floor(s / 10))}`;
}

function fmtScore(s: number): string {
  if (s <= 0) return "";
  if (s >= 99.95) return "100";
  return s < 10 ? s.toFixed(1) : s.toFixed(0);
}

function Flag({ code }: { code: string | null }) {
  if (!code) {
    return (
      <span
        aria-hidden
        className="inline-block h-[15px] w-5 shrink-0 rounded-[2px] bg-white/10"
      />
    );
  }
  const cc = code.toLowerCase();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w20/${cc}.png`}
      srcSet={`https://flagcdn.com/w40/${cc}.png 2x`}
      width={20}
      height={15}
      alt=""
      loading="lazy"
      className="h-[15px] w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-black/40"
    />
  );
}

export default function KinchBoard({ rows, continents }: Props) {
  const [continent, setContinent] = useState<string | null>(null);

  // Restore a shared ?continent= link on mount; keep the URL in sync without
  // any server roundtrip.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("continent");
    if (c && continents.some((x) => x.id === c)) setContinent(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(c: string | null) {
    setContinent(c);
    const url = new URL(window.location.href);
    if (c) url.searchParams.set("continent", c);
    else url.searchParams.delete("continent");
    window.history.replaceState(null, "", url);
  }

  const view = useMemo(() => {
    if (!continent) {
      return rows.map((r) => ({ r, rank: r.rw, kinch: r.kw, scores: r.sw }));
    }
    return rows
      .filter((r) => r.continent === continent)
      .map((r) => ({ r, rank: r.rc, kinch: r.kc, scores: r.sc }))
      .sort((a, b) => a.rank - b.rank || b.kinch - a.kinch);
  }, [rows, continent]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => select(null)}
          className={[
            "rounded-full px-3 py-1.5 text-sm transition ring-1",
            continent === null
              ? "bg-white text-neutral-900 ring-white"
              : "bg-white/5 text-white/70 ring-white/10 hover:text-white",
          ].join(" ")}
        >
          World
        </button>
        {continents.map((c) => (
          <button
            key={c.id}
            onClick={() => select(c.id)}
            className={[
              "rounded-full px-3 py-1.5 text-sm transition ring-1",
              c.id === continent
                ? "bg-white text-neutral-900 ring-white"
                : "bg-white/5 text-white/70 ring-white/10 hover:text-white",
            ].join(" ")}
          >
            {c.name}
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-white/40">
        Scores relative to the {continent ? "continental" : "world"} record ·
        100 = record holder
      </p>

      <div className="board max-h-[calc(100dvh-15rem)] overflow-auto rounded-xl border border-white/10">
        <table className="w-full border-separate border-spacing-0 text-xs sm:text-sm tabular-nums">
          <thead>
            <tr>
              <th className="corner sticky left-0 top-0 z-30 px-2 py-2 text-left font-normal text-white/50">
                Country
              </th>
              <th className="head sticky top-0 z-20 px-2 py-2 text-right font-semibold text-white/80">
                Kinch
              </th>
              {KINCH_EVENTS.map((e) => (
                <th
                  key={e.id}
                  className="head sticky top-0 z-20 px-1 py-2 text-center font-normal text-white/50"
                >
                  {e.shortName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map(({ r, rank, kinch, scores }) => (
              <tr key={r.id} className="group">
                <td className="left sticky left-0 z-10 border-t border-white/5 px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-6 shrink-0 text-right text-white/40">
                      {rank}
                    </span>
                    <Flag code={r.code} />
                    <span className="truncate max-w-[6.5rem] sm:max-w-[11rem] font-medium">
                      {r.name}
                    </span>
                  </div>
                </td>
                <td className="border-t border-white/5 px-2 py-1.5 text-right font-semibold">
                  {kinch.toFixed(2)}
                </td>
                {scores.map((s, i) => (
                  <td
                    key={KINCH_EVENTS[i].id}
                    className={`border-t border-white/5 px-1 py-1.5 text-center ${heatClass(s)}`}
                  >
                    {fmtScore(s)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
