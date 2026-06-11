"use client";

import { useEffect, useMemo, useState } from "react";
import { KINCH_EVENTS } from "@/lib/events";
import { continentName } from "@/lib/wca-meta";
import type { BoardRow, ContinentInfo, EventRefs } from "@/lib/queries";
import DetailSheet from "./DetailSheet";

interface Props {
  rows: BoardRow[];
  continents: ContinentInfo[];
  refs: EventRefs;
}

function heatClass(s: number): string {
  if (s <= 0) return "";
  return `h${Math.min(10, Math.floor(s / 10))}`;
}

function fmtScore(s: number): string {
  if (s <= 0) return "";
  if (s >= 99.95) return "100";
  return s < 10 ? s.toFixed(1) : Math.round(s).toString();
}

function Flag({ code }: { code: string | null }) {
  if (!code) {
    return (
      <span
        aria-hidden
        className="inline-block h-[13px] w-[18px] shrink-0 rounded-[2px] bg-white/10"
      />
    );
  }
  const cc = code.toLowerCase();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w20/${cc}.png`}
      srcSet={`https://flagcdn.com/w40/${cc}.png 2x`}
      width={18}
      height={13}
      alt=""
      loading="lazy"
      className="h-[13px] w-[18px] shrink-0 rounded-[2px] object-cover ring-1 ring-black/40"
    />
  );
}

export default function KinchBoard({ rows, continents, refs }: Props) {
  const [continent, setContinent] = useState<string | null>(null);
  const [openCountry, setOpenCountry] = useState<BoardRow | null>(null);
  const [focusEvent, setFocusEvent] = useState<string | null>(null);

  // Restore + sync ?continent= without any server roundtrip.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("continent");
    if (c && continents.some((x) => x.id === c)) setContinent(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectContinent(c: string | null) {
    setContinent(c);
    const url = new URL(window.location.href);
    if (c) url.searchParams.set("continent", c);
    else url.searchParams.delete("continent");
    window.history.replaceState(null, "", url);
  }

  const scope = continent ?? "world";
  const scopeLabel = continent ? continentName(continent) : "World";

  const view = useMemo(() => {
    if (!continent) {
      return rows.map((r) => ({ r, rank: r.rw, kinch: r.kw, mode: "w" as const }));
    }
    return rows
      .filter((r) => r.continent === continent)
      .map((r) => ({ r, rank: r.rc, kinch: r.kc, mode: "c" as const }))
      .sort((a, b) => a.rank - b.rank);
  }, [rows, continent]);

  function open(country: BoardRow, eventId: string | null) {
    setOpenCountry(country);
    setFocusEvent(eventId);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => selectContinent(null)}
          className={[
            "rounded-full px-3 py-1.5 text-xs sm:text-sm transition ring-1",
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
            onClick={() => selectContinent(c.id)}
            className={[
              "rounded-full px-3 py-1.5 text-xs sm:text-sm transition ring-1",
              c.id === continent
                ? "bg-white text-neutral-900 ring-white"
                : "bg-white/5 text-white/70 ring-white/10 hover:text-white",
            ].join(" ")}
          >
            {c.name}
          </button>
        ))}
      </div>

      <p className="mb-2 text-[11px] text-white/40">
        Scores relative to the {continent ? "continental" : "world"} record · 100
        = record holder · tap a cell for details · pinch / scroll horizontally for more events
      </p>

      <div className="board max-h-[calc(100dvh-13rem)] overflow-auto rounded-xl border border-white/10">
        <table className="w-full border-separate border-spacing-0 text-[11px] sm:text-xs tabular-nums">
          <thead>
            <tr>
              <th className="corner sticky left-0 top-0 z-30 px-1.5 py-1.5 text-left font-normal text-white/45">
                <span className="text-[10px] uppercase tracking-wide">#</span>
              </th>
              <th className="corner2 sticky left-7 top-0 z-30 py-1.5 pr-1 text-left font-normal text-white/45">
                <span className="text-[10px] uppercase tracking-wide">Country</span>
              </th>
              <th className="head sticky top-0 z-20 px-1.5 py-1.5 text-right font-semibold text-white/85">
                Kinch
              </th>
              {KINCH_EVENTS.map((e) => (
                <th
                  key={e.id}
                  className="head sticky top-0 z-20 px-1 py-1.5 text-center font-normal text-white/55"
                  title={e.longName}
                >
                  {e.shortName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map(({ r, rank, kinch, mode }) => (
              <tr
                key={r.id}
                className="group cursor-pointer transition hover:bg-white/[0.04]"
              >
                <td
                  onClick={() => open(r, null)}
                  className="rank sticky left-0 z-10 border-t border-white/5 px-1.5 py-1 text-right text-white/45"
                >
                  {rank}
                </td>
                <td
                  onClick={() => open(r, null)}
                  className="left sticky left-7 z-10 border-t border-white/5 py-1 pr-2"
                >
                  <div className="flex items-center gap-1.5">
                    <Flag code={r.code} />
                    <span className="truncate max-w-[5.5rem] sm:max-w-[10rem] font-medium">
                      {r.name}
                    </span>
                  </div>
                </td>
                <td
                  onClick={() => open(r, null)}
                  className="border-t border-white/5 px-1.5 py-1 text-right font-semibold"
                >
                  {kinch.toFixed(1)}
                </td>
                {KINCH_EVENTS.map((e) => {
                  const slot = r.e[e.id];
                  const s = mode === "w" ? slot?.sw ?? 0 : slot?.sc ?? 0;
                  return (
                    <td
                      key={e.id}
                      onClick={() => open(r, e.id)}
                      className={`cell border-t border-white/5 px-0.5 py-1 text-center ${heatClass(s)}`}
                    >
                      {fmtScore(s)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openCountry && (
        <DetailSheet
          country={openCountry}
          rows={rows}
          refs={refs}
          scope={scope}
          scopeLabel={scopeLabel}
          focusEventId={focusEvent}
          onClose={() => {
            setOpenCountry(null);
            setFocusEvent(null);
          }}
          onFocusEvent={setFocusEvent}
        />
      )}
    </div>
  );
}
