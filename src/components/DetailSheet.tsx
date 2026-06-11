"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { KINCH_EVENTS, type KinchEvent } from "@/lib/events";
import { formatResult, parseResult } from "@/lib/format";
import type { BoardRow, EventRefs, RefRow } from "@/lib/queries";
import {
  kinchScore,
  rankAmong,
  refFor,
  simulateKinch,
  type SimState,
} from "@/lib/scoring";

interface Props {
  country: BoardRow;
  rows: BoardRow[];
  refs: EventRefs;
  /** "world" or a continent id. Determines which reference scope we use. */
  scope: "world" | string;
  scopeLabel: string;
  focusEventId: string | null;
  onClose: () => void;
  onFocusEvent: (id: string | null) => void;
}

function Flag({ code, size = 18 }: { code: string | null; size?: number }) {
  if (!code) {
    return (
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-[2px] bg-white/10"
        style={{ width: size * 1.33, height: size }}
      />
    );
  }
  const cc = code.toLowerCase();
  const w = Math.round(size * 1.33);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w${w * 2}/${cc}.png`}
      width={w}
      height={size}
      alt=""
      loading="lazy"
      className="shrink-0 rounded-[2px] object-cover ring-1 ring-black/40"
      style={{ width: w, height: size }}
    />
  );
}

function gapText(eventId: string, my: number, theirs: number, kind: "s" | "a"): string {
  if (!my || !theirs || my === theirs) return "0";
  if (eventId === "333mbf") {
    // Higher decoded score is better → "theirs" worse than "my" means smaller score.
    return "";
  }
  if (eventId === "333fm") {
    // Stored as moves (single) or moves*100 (average); compute delta in moves.
    if (kind === "s") {
      const d = my - theirs;
      return d > 0 ? `+${d} moves` : `${d} moves`;
    }
    const d = (my - theirs) / 100;
    return d > 0 ? `+${d.toFixed(2)} moves` : `${d.toFixed(2)} moves`;
  }
  // centiseconds → seconds
  const d = (my - theirs) / 100;
  return d > 0 ? `+${d.toFixed(2)}s` : `${d.toFixed(2)}s`;
}

function pctBehind(value: number, ref: number, eventId: string): string {
  if (!value || !ref) return "";
  if (eventId === "333mbf") return "";
  const pct = ((value - ref) / ref) * 100;
  if (Math.abs(pct) < 0.05) return "0%";
  return pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
}

function wcaPersonUrl(id: string) {
  return `https://www.worldcubeassociation.org/persons/${id}`;
}
function wcaCompUrl(id: string) {
  return `https://www.worldcubeassociation.org/competitions/${id}`;
}

interface EventLine {
  event: KinchEvent;
  /** Raw NR value for the active scope/kind. */
  value: number;
  kind: "s" | "a";
  score: number;
  holderName: string | null;
  holderId: string | null;
  ref: RefRow | null;
  /** Score after the user's edits. */
  newScore: number;
  newValue: number;
  edited: boolean;
}

export default function DetailSheet({
  country,
  rows,
  refs,
  scope,
  scopeLabel,
  focusEventId,
  onClose,
  onFocusEvent,
}: Props) {
  const [edit, setEdit] = useState(false);
  const [sim, setSim] = useState<SimState>(() => initialSim(country, scope));
  const closeRef = useRef<HTMLButtonElement>(null);

  // Reset simulation when country or scope changes.
  useEffect(() => {
    setSim(initialSim(country, scope));
    setEdit(false);
  }, [country.id, scope]);

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const lines = useMemo<EventLine[]>(() => {
    return KINCH_EVENTS.map((event) => {
      const slot = country.e[event.id];
      const value = scope === "world" ? slot?.vw ?? 0 : slot?.vc ?? 0;
      const kind = scope === "world" ? slot?.kw ?? "a" : slot?.kc ?? "a";
      const score = scope === "world" ? slot?.sw ?? 0 : slot?.sc ?? 0;
      const ref = refFor(refs, event.id, scope, kind);
      const simSlot = sim[event.id];
      const newValue = simSlot?.value ?? value;
      const refVal = ref?.value ?? 0;
      const newScore = kinchScore(event.id, newValue, refVal);
      return {
        event,
        value,
        kind,
        score,
        holderName: slot?.h?.n ?? null,
        holderId: slot?.h?.i ?? null,
        ref,
        newScore,
        newValue,
        edited: newValue !== value,
      };
    });
  }, [country, refs, scope, sim]);

  const currentKinch = scope === "world" ? country.kw : country.kc;
  const currentRank = scope === "world" ? country.rw : country.rc;
  const newKinch = useMemo(
    () => simulateKinch(refs, sim, scope),
    [refs, sim, scope],
  );
  const newRank = useMemo(
    () => rankAmong(rows, country.id, newKinch, scope),
    [rows, country.id, newKinch, scope],
  );

  const anyEdit = lines.some((l) => l.edited);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-2xl rounded-t-2xl bg-neutral-950 ring-1 ring-white/10 shadow-2xl
                   sm:rounded-2xl max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <Flag code={country.code} size={20} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{country.name}</div>
            <div className="text-xs text-white/50">
              {scopeLabel} · Rank #{anyEdit ? newRank : currentRank}
              {anyEdit && newRank !== currentRank && (
                <span
                  className={
                    newRank < currentRank
                      ? "ml-1 text-emerald-400"
                      : "ml-1 text-rose-400"
                  }
                >
                  ({newRank < currentRank ? "↑" : "↓"}
                  {Math.abs(newRank - currentRank)})
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">
              {(anyEdit ? newKinch : currentKinch).toFixed(2)}
            </div>
            {anyEdit && (
              <div className="text-xs text-white/40 tabular-nums">
                was {currentKinch.toFixed(2)}
              </div>
            )}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="ml-1 rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2 sm:px-5">
          <div className="text-xs text-white/50">
            Tap an event for record details
          </div>
          <button
            onClick={() => {
              if (edit) setSim(initialSim(country, scope));
              setEdit(!edit);
            }}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium ring-1 transition",
              edit
                ? "bg-amber-300 text-neutral-900 ring-amber-300"
                : "bg-white/5 text-white/80 ring-white/15 hover:bg-white/10",
            ].join(" ")}
          >
            {edit ? "Exit what-if" : "What if?"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 sm:px-4">
          {lines.map((l) => (
            <EventRow
              key={l.event.id}
              line={l}
              edit={edit}
              focused={focusEventId === l.event.id}
              onFocus={() => onFocusEvent(focusEventId === l.event.id ? null : l.event.id)}
              onChange={(value) => {
                setSim((prev) => ({
                  ...prev,
                  [l.event.id]: { value, kind: l.kind },
                }));
              }}
              onReset={() => {
                setSim((prev) => ({
                  ...prev,
                  [l.event.id]: { value: l.value, kind: l.kind },
                }));
              }}
              scopeLabel={scopeLabel}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function initialSim(country: BoardRow, scope: "world" | string): SimState {
  const s: SimState = {};
  for (const e of KINCH_EVENTS) {
    const slot = country.e[e.id];
    if (!slot) continue;
    s[e.id] =
      scope === "world"
        ? { value: slot.vw, kind: slot.kw }
        : { value: slot.vc, kind: slot.kc };
  }
  return s;
}

function EventRow({
  line,
  edit,
  focused,
  onFocus,
  onChange,
  onReset,
  scopeLabel,
}: {
  line: EventLine;
  edit: boolean;
  focused: boolean;
  onFocus: () => void;
  onChange: (value: number) => void;
  onReset: () => void;
  scopeLabel: string;
}) {
  const { event, value, kind, score, ref, newScore, newValue, edited } = line;
  const hasResult = value > 0;
  const heat = scoreHeat(edited ? newScore : score);

  return (
    <div className="rounded-xl">
      <button
        onClick={onFocus}
        className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{event.longName}</div>
          <div className="truncate text-xs text-white/45">
            {hasResult ? (
              <>
                NR {formatResult(value, event.id, kind)}
                {event.type === "best" && (kind === "s" ? " · single" : " · avg")}
                {line.holderName ? ` · ${line.holderName}` : ""}
              </>
            ) : (
              "No NR yet"
            )}
          </div>
        </div>
        <div className="text-right text-xs text-white/50 tabular-nums">
          {ref ? formatResult(ref.value, event.id, kind) : "—"}
          <div className="text-[10px] uppercase tracking-wide">
            {scopeLabel === "World" ? "WR" : "CR"}
          </div>
        </div>
        <span
          className={`min-w-[3.25rem] rounded-md px-2 py-0.5 text-right text-sm font-semibold tabular-nums ${heat}`}
        >
          {fmtScore(edited ? newScore : score)}
          {edited && (
            <div className="text-[10px] font-normal text-white/60 tabular-nums">
              was {fmtScore(score)}
            </div>
          )}
        </span>
      </button>

      {focused && (
        <div className="mx-2 mb-3 mt-1 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
          {hasResult && line.holderName && (
            <DetailLine
              label={`${scopeLabel === "World" ? "Country" : "Country"} NR`}
              valueLabel={formatResult(value, event.id, kind)}
              personName={line.holderName}
              personId={line.holderId}
              comp={null}
              ref={null}
              eventId={event.id}
              kind={kind}
              myValue={value}
            />
          )}
          {ref && (
            <DetailLine
              label={scopeLabel === "World" ? "World Record" : `${scopeLabel} Record`}
              valueLabel={formatResult(ref.value, event.id, kind)}
              personName={ref.personName}
              personId={ref.personId}
              comp={ref}
              ref={null}
              eventId={event.id}
              kind={kind}
              myValue={hasResult ? value : 0}
              myCountry={hasResult}
            />
          )}

          {edit && event.id !== "333mbf" && (
            <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
              <label className="text-xs text-white/60">What-if NR:</label>
              <input
                type="text"
                inputMode="decimal"
                defaultValue={
                  newValue > 0 ? formatResult(newValue, event.id, kind) : ""
                }
                onChange={(e) => {
                  const parsed = parseResult(e.target.value, event.id, kind);
                  if (parsed !== null) onChange(parsed);
                  else if (e.target.value.trim() === "") onChange(0);
                }}
                placeholder={
                  event.id === "333fm" && kind === "s"
                    ? "moves"
                    : event.id === "333fm"
                      ? "25.33"
                      : "10.42 or 1:02.53"
                }
                className="w-32 rounded-md bg-black/40 px-2 py-1 text-sm ring-1 ring-white/15 focus:outline-none focus:ring-white/40"
              />
              {edited && (
                <button
                  onClick={onReset}
                  className="text-xs text-white/50 hover:text-white"
                >
                  reset
                </button>
              )}
              <span className="ml-auto text-xs tabular-nums">
                {edited && (
                  <>
                    <span
                      className={
                        newScore > score
                          ? "text-emerald-400"
                          : newScore < score
                            ? "text-rose-400"
                            : "text-white/40"
                      }
                    >
                      {newScore > score ? "+" : ""}
                      {(newScore - score).toFixed(2)}
                    </span>{" "}
                    pts
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailLine({
  label,
  valueLabel,
  personName,
  personId,
  comp,
  eventId,
  kind,
  myValue,
  myCountry,
}: {
  label: string;
  valueLabel: string;
  personName: string;
  personId: string | null;
  comp: RefRow | null;
  ref: null;
  eventId: string;
  kind: "s" | "a";
  myValue: number;
  myCountry?: boolean;
}) {
  const gap = comp && myValue > 0 ? gapText(eventId, myValue, comp.value, kind) : "";
  const pct = comp && myValue > 0 ? pctBehind(myValue, comp.value, eventId) : "";
  return (
    <div className="border-t border-white/5 py-2 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-2">
        <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>
        {comp && myCountry && (gap || pct) && (
          <div className="text-xs text-white/40">
            you {gap}
            {pct && ` (${pct})`}
          </div>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
        <span className="font-mono text-base font-semibold tabular-nums">
          {valueLabel}
        </span>
        {personId ? (
          <a
            href={wcaPersonUrl(personId)}
            target="_blank"
            rel="noreferrer"
            className="text-white/85 underline-offset-2 hover:underline"
          >
            {personName}
          </a>
        ) : (
          <span className="text-white/85">{personName}</span>
        )}
        {comp?.compId && (
          <a
            href={wcaCompUrl(comp.compId)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-white/55 underline-offset-2 hover:underline"
          >
            {comp.compName ?? comp.compId}
          </a>
        )}
        {comp?.compDate && (
          <span className="text-xs text-white/45">{comp.compDate}</span>
        )}
        {comp?.compCity && (
          <span className="text-xs text-white/45">· {comp.compCity}</span>
        )}
      </div>
    </div>
  );
}

function scoreHeat(s: number): string {
  if (s <= 0) return "text-white/30";
  const h = Math.min(10, Math.floor(s / 10));
  return `h${h}`;
}

function fmtScore(s: number): string {
  if (s <= 0) return "—";
  if (s >= 99.95) return "100";
  return s < 10 ? s.toFixed(1) : s.toFixed(1);
}
