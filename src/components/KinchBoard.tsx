"use client";

import { useEffect, useMemo, useState } from "react";
import { KINCH_EVENTS } from "@/lib/events";
import { continentName } from "@/lib/wca-meta";
import type { BoardRow, ContinentInfo, EventRefs } from "@/lib/queries";
import {
  adjustBoard,
  countEdits,
  type Edit,
  type Edits,
} from "@/lib/scoring";
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
  const [openCountryId, setOpenCountryId] = useState<string | null>(null);
  const [focusEvent, setFocusEvent] = useState<string | null>(null);
  const [whatIf, setWhatIf] = useState(false);
  const [edits, setEdits] = useState<Edits>({});

  // Restore + sync ?continent= without any server roundtrip.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("continent");
    if (c && continents.some((x) => x.id === c)) setContinent(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Page-wide visual signal for what-if mode (background tint + border).
  useEffect(() => {
    document.body.classList.toggle("whatif", whatIf);
    return () => document.body.classList.remove("whatif");
  }, [whatIf]);

  function selectContinent(c: string | null) {
    setContinent(c);
    const url = new URL(window.location.href);
    if (c) url.searchParams.set("continent", c);
    else url.searchParams.delete("continent");
    window.history.replaceState(null, "", url);
  }

  function setEdit(countryId: string, eventId: string, edit: Edit | null) {
    setEdits((prev) => {
      const next = { ...prev };
      const ev = { ...(next[countryId] ?? {}) };
      if (edit) ev[eventId] = edit;
      else delete ev[eventId];
      if (Object.keys(ev).length === 0) delete next[countryId];
      else next[countryId] = ev;
      return next;
    });
  }

  function exitWhatIf() {
    setWhatIf(false);
    setEdits({});
  }

  const scope = continent ?? "world";
  const scopeLabel = continent ? continentName(continent) : "World";
  const nEdits = countEdits(edits);

  const adjusted = useMemo(
    () => (whatIf ? adjustBoard(rows, refs, edits, scope) : null),
    [whatIf, rows, refs, edits, scope],
  );

  const view = useMemo(() => {
    const base = continent
      ? rows.filter((r) => r.continent === continent)
      : rows;
    const items = base.map((r) => {
      const baseRank = continent ? r.rc : r.rw;
      const baseKinch = continent ? r.kc : r.kw;
      const adj = adjusted?.get(r.id) ?? null;
      return {
        r,
        baseRank,
        rank: adj ? adj.rank : baseRank,
        kinch: adj ? adj.kinch : baseKinch,
        kinchChanged: adj ? Math.abs(adj.kinch - baseKinch) >= 0.005 : false,
        scores: adj ? adj.scores : null,
      };
    });
    items.sort((a, b) => a.rank - b.rank || b.kinch - a.kinch);
    return items;
  }, [rows, continent, adjusted]);

  const openCountry = openCountryId
    ? rows.find((r) => r.id === openCountryId) ?? null
    : null;

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">
        <div className="mb-1 font-medium text-white/80">
          Rankings are being recomputed
        </div>
        The data refreshes automatically — check back in a few minutes.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
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
        <button
          onClick={() => (whatIf ? exitWhatIf() : setWhatIf(true))}
          className={[
            "ml-auto rounded-full px-3 py-1.5 text-xs sm:text-sm font-medium ring-1 transition",
            whatIf
              ? "bg-amber-300 text-neutral-900 ring-amber-300"
              : "bg-white/5 text-white/70 ring-white/10 hover:text-white",
          ].join(" ")}
        >
          {whatIf ? "Exit what-if" : "What if?"}
        </button>
      </div>

      {whatIf && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs">
          <span className="font-semibold uppercase tracking-wide text-amber-300">
            What-if mode
          </span>
          <span className="text-white/60">
            {nEdits === 0
              ? "tap a cell, then edit its NR"
              : `${nEdits} edit${nEdits === 1 ? "" : "s"}`}
          </span>
          {nEdits > 0 && (
            <button
              onClick={() => setEdits({})}
              className="rounded-full bg-white/10 px-2.5 py-0.5 font-medium text-white/80 hover:bg-white/20"
            >
              Reset all
            </button>
          )}
          <button
            onClick={exitWhatIf}
            className="ml-auto rounded-full bg-amber-300 px-2.5 py-0.5 font-semibold text-neutral-900 hover:bg-amber-200"
          >
            Exit &amp; revert
          </button>
        </div>
      )}

      <p className="mb-2 text-[11px] text-white/40">
        Scores relative to the {continent ? "continental" : "world"} record · 100
        = record holder · tap a cell for details
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
            {view.map(({ r, rank, baseRank, kinch, kinchChanged, scores }) => {
              const rankDelta = baseRank - rank;
              return (
                <tr
                  key={r.id}
                  className="group cursor-pointer transition hover:bg-white/[0.04]"
                >
                  <td
                    onClick={() => {
                      setOpenCountryId(r.id);
                      setFocusEvent(null);
                    }}
                    className="rank sticky left-0 z-10 border-t border-white/5 px-1.5 py-1 text-right text-white/45"
                  >
                    <div>{rank}</div>
                    {whatIf && rankDelta !== 0 && (
                      <div
                        className={`text-[9px] leading-none ${rankDelta > 0 ? "text-emerald-400" : "text-rose-400"}`}
                      >
                        {rankDelta > 0 ? "↑" : "↓"}
                        {Math.abs(rankDelta)}
                      </div>
                    )}
                  </td>
                  <td
                    onClick={() => {
                      setOpenCountryId(r.id);
                      setFocusEvent(null);
                    }}
                    className="left sticky left-7 z-10 border-t border-white/5 py-1 pr-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <Flag code={r.code} />
                      <span className="max-w-[5.5rem] truncate font-medium sm:max-w-[10rem]">
                        {r.name}
                      </span>
                    </div>
                  </td>
                  <td
                    onClick={() => {
                      setOpenCountryId(r.id);
                      setFocusEvent(null);
                    }}
                    className={`border-t border-white/5 px-1.5 py-1 text-right font-semibold ${kinchChanged ? "text-amber-300" : ""}`}
                  >
                    {kinch.toFixed(1)}
                  </td>
                  {KINCH_EVENTS.map((e) => {
                    const slot = r.e[e.id];
                    const s = scores
                      ? scores[e.id] ?? 0
                      : continent
                        ? slot?.sc ?? 0
                        : slot?.sw ?? 0;
                    const isEdited = !!edits[r.id]?.[e.id];
                    return (
                      <td
                        key={e.id}
                        onClick={() => {
                          setOpenCountryId(r.id);
                          setFocusEvent(e.id);
                        }}
                        className={`cell border-t border-white/5 px-0.5 py-1 text-center ${heatClass(s)} ${isEdited ? "edited" : ""}`}
                      >
                        {fmtScore(s)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
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
          whatIf={whatIf}
          edits={edits}
          adjustedKinch={adjusted?.get(openCountry.id)?.kinch ?? null}
          adjustedRank={adjusted?.get(openCountry.id)?.rank ?? null}
          onEdit={(eventId, edit) => setEdit(openCountry.id, eventId, edit)}
          onToggleWhatIf={() => (whatIf ? exitWhatIf() : setWhatIf(true))}
          onClose={() => {
            setOpenCountryId(null);
            setFocusEvent(null);
          }}
          onFocusEvent={setFocusEvent}
        />
      )}
    </div>
  );
}
