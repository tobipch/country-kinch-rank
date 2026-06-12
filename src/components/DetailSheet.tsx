"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { KINCH_EVENTS, type KinchEvent } from "@/lib/events";
import { formatResult, parseResult } from "@/lib/format";
import type { BoardRow, EventRefs, RefRow } from "@/lib/queries";
import {
  effectiveRefValue,
  kinchScore,
  refFor,
  type Edit,
  type Edits,
} from "@/lib/scoring";
import type { Kind } from "@/lib/kinch";

interface Props {
  country: BoardRow;
  rows: BoardRow[];
  refs: EventRefs;
  scope: "world" | string;
  scopeLabel: string;
  focusEventId: string | null;
  whatIf: boolean;
  edits: Edits;
  adjustedKinch: number | null;
  adjustedRank: number | null;
  onEdit: (eventId: string, edit: Edit | null) => void;
  onToggleWhatIf: () => void;
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

function gapText(
  eventId: string,
  my: number,
  theirs: number,
  kind: Kind,
): string {
  if (!my || !theirs || my === theirs || eventId === "333mbf") return "";
  if (eventId === "333fm") {
    const d = kind === "s" ? my - theirs : (my - theirs) / 100;
    const txt = kind === "s" ? `${d}` : d.toFixed(2);
    return d > 0 ? `+${txt} moves` : `${txt} moves`;
  }
  const d = (my - theirs) / 100;
  return d > 0 ? `+${d.toFixed(2)}s` : `${d.toFixed(2)}s`;
}

function pctBehind(value: number, ref: number, eventId: string): string {
  if (!value || !ref || eventId === "333mbf") return "";
  const pct = ((value - ref) / ref) * 100;
  if (Math.abs(pct) < 0.05) return "0%";
  return pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
}

const wcaPersonUrl = (id: string) =>
  `https://www.worldcubeassociation.org/persons/${id}`;
const wcaCompUrl = (id: string) =>
  `https://www.worldcubeassociation.org/competitions/${id}`;

interface EventLine {
  event: KinchEvent;
  baseValue: number;
  baseScore: number;
  kind: Kind;
  value: number;
  edit: Edit | null;
  storedRef: RefRow | null;
  effRefValue: number;
  refIsWhatIf: boolean;
  newScore: number;
  holderName: string | null;
  holderId: string | null;
}

export default function DetailSheet({
  country,
  rows,
  refs,
  scope,
  scopeLabel,
  focusEventId,
  whatIf,
  edits,
  adjustedKinch,
  adjustedRank,
  onEdit,
  onToggleWhatIf,
  onClose,
  onFocusEvent,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Mount-only: focus the close button and lock body scroll. Using empty deps
  // is critical — onClose is a fresh closure on every parent render, so
  // depending on it would steal focus back from any input the user is typing
  // in. The keydown handler reads through a ref to always see the latest
  // onClose without re-registering.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  const contOfMap = useMemo(
    () => new Map(rows.map((r) => [r.id, r.continent])),
    [rows],
  );

  const lines = useMemo<EventLine[]>(() => {
    return KINCH_EVENTS.map((event) => {
      const slot = country.e[event.id];
      const baseValue = scope === "world" ? slot?.vw ?? 0 : slot?.vc ?? 0;
      const baseKind: Kind =
        scope === "world" ? slot?.kw ?? "a" : slot?.kc ?? "a";
      const baseScore = scope === "world" ? slot?.sw ?? 0 : slot?.sc ?? 0;
      const edit = edits[country.id]?.[event.id] ?? null;
      const kind = edit?.kind ?? baseKind;
      const value = edit?.value ?? baseValue;
      const storedRef = refFor(refs, event.id, scope, kind);
      const effRefValue = whatIf
        ? effectiveRefValue(refs, event.id, kind, scope, edits, (cid) =>
            contOfMap.get(cid),
          )
        : storedRef?.value ?? 0;
      const newScore = kinchScore(event.id, value, effRefValue);
      return {
        event,
        baseValue,
        baseScore,
        kind,
        value,
        edit,
        storedRef,
        effRefValue,
        refIsWhatIf: !!storedRef && effRefValue !== storedRef.value,
        newScore,
        holderName: slot?.h?.n ?? null,
        holderId: slot?.h?.i ?? null,
      };
    });
  }, [country, refs, scope, edits, whatIf, contOfMap]);

  const baseKinch = scope === "world" ? country.kw : country.kc;
  const baseRank = scope === "world" ? country.rw : country.rc;
  const kinch = whatIf && adjustedKinch !== null ? adjustedKinch : baseKinch;
  const rank = whatIf && adjustedRank !== null ? adjustedRank : baseRank;
  const kinchChanged = whatIf && Math.abs(kinch - baseKinch) >= 0.005;
  const rankChanged = whatIf && rank !== baseRank;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-neutral-950 shadow-2xl ring-1 ring-white/10 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <Flag code={country.code} size={20} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{country.name}</div>
            <div className="text-xs text-white/50">
              {scopeLabel} · Rank #{rank}
              {rankChanged && (
                <span
                  className={
                    rank < baseRank ? "ml-1 text-emerald-400" : "ml-1 text-rose-400"
                  }
                >
                  ({rank < baseRank ? "↑" : "↓"}
                  {Math.abs(rank - baseRank)})
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div
              className={`text-2xl font-semibold tabular-nums ${kinchChanged ? "text-amber-300" : ""}`}
            >
              {kinch.toFixed(2)}
            </div>
            {kinchChanged && (
              <div className="text-xs tabular-nums text-white/40">
                was {baseKinch.toFixed(2)}
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
            onClick={onToggleWhatIf}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium ring-1 transition",
              whatIf
                ? "bg-amber-300 text-neutral-900 ring-amber-300"
                : "bg-white/5 text-white/80 ring-white/15 hover:bg-white/10",
            ].join(" ")}
          >
            {whatIf ? "Exit what-if" : "What if?"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 sm:px-4">
          {lines.map((l) => (
            <EventRow
              key={l.event.id}
              line={l}
              whatIf={whatIf}
              focused={focusEventId === l.event.id}
              onFocus={() =>
                onFocusEvent(focusEventId === l.event.id ? null : l.event.id)
              }
              onEdit={onEdit}
              scopeLabel={scopeLabel}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EventRow({
  line,
  whatIf,
  focused,
  onFocus,
  onEdit,
  scopeLabel,
}: {
  line: EventLine;
  whatIf: boolean;
  focused: boolean;
  onFocus: () => void;
  onEdit: (eventId: string, edit: Edit | null) => void;
  scopeLabel: string;
}) {
  const { event, baseValue, baseScore, kind, value, edit, storedRef } = line;
  const hasResult = value > 0;
  const edited = edit !== null;
  const displayScore = whatIf ? line.newScore : baseScore;
  const heat = scoreHeat(displayScore);

  const [text, setText] = useState(() =>
    value > 0 ? formatResult(value, event.id, kind) : "",
  );
  const [inputFocused, setInputFocused] = useState(false);
  // When the edit is cleared externally (reset / reset all / exit), restore
  // the base value — but never while the user is typing in the field, since
  // transient states like "17." parse as invalid and must not be clobbered.
  useEffect(() => {
    if (!edit && !inputFocused) {
      setText(baseValue > 0 ? formatResult(baseValue, event.id, kind) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, inputFocused]);

  return (
    <div className="rounded-xl">
      <button
        onClick={onFocus}
        className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {event.longName}
            {edited && (
              <span className="ml-1.5 rounded bg-amber-300/15 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                edited
              </span>
            )}
          </div>
          <div className="truncate text-xs text-white/45">
            {hasResult ? (
              <>
                NR {formatResult(edited ? baseValue : value, event.id, kind)}
                {edited &&
                  ` → ${formatResult(value, event.id, kind)}`}
                {event.type === "best" && (kind === "s" ? " · single" : " · avg")}
                {line.holderName && !edited ? ` · ${line.holderName}` : ""}
              </>
            ) : (
              "No NR yet"
            )}
          </div>
        </div>
        <div className="text-right text-xs text-white/50 tabular-nums">
          {line.effRefValue > 0
            ? formatResult(line.effRefValue, event.id, kind)
            : "—"}
          <div className="text-[10px] uppercase tracking-wide">
            {line.refIsWhatIf ? (
              <span className="text-amber-300">what-if ref</span>
            ) : scopeLabel === "World" ? (
              "WR"
            ) : (
              "CR"
            )}
          </div>
        </div>
        <span
          className={`min-w-[3.25rem] rounded-md px-2 py-0.5 text-right text-sm font-semibold tabular-nums ${heat}`}
        >
          {fmtScore(displayScore)}
          {whatIf && Math.abs(displayScore - baseScore) >= 0.05 && (
            <div className="text-[10px] font-normal tabular-nums text-white/60">
              was {fmtScore(baseScore)}
            </div>
          )}
        </span>
      </button>

      {focused && (
        <div className="mx-2 mb-3 mt-1 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
          {hasResult && line.holderName && (
            <DetailLine
              label="Country NR"
              valueLabel={formatResult(baseValue, event.id, kind)}
              personName={line.holderName}
              personId={line.holderId}
            />
          )}
          {storedRef && (
            <DetailLine
              label={scopeLabel === "World" ? "World Record" : `${scopeLabel} Record`}
              valueLabel={formatResult(storedRef.value, event.id, kind)}
              personName={storedRef.personName}
              personId={storedRef.personId}
              compId={storedRef.compId}
              compName={storedRef.compName}
              compDate={storedRef.compDate}
              compCity={storedRef.compCity}
              note={
                hasResult
                  ? [
                      gapText(event.id, baseValue, storedRef.value, kind),
                      pctBehind(baseValue, storedRef.value, event.id),
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : ""
              }
            />
          )}

          {whatIf && event.id !== "333mbf" && (
            <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
              <label className="text-xs text-white/60">What-if NR:</label>
              <input
                type="text"
                inputMode="decimal"
                value={text}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onChange={(e) => {
                  const t = e.target.value;
                  setText(t);
                  if (t.trim() === "") {
                    onEdit(event.id, null);
                    return;
                  }
                  const parsed = parseResult(t, event.id, kind);
                  // Invalid mid-edit states ("17.") keep the last valid edit.
                  if (parsed === null) return;
                  if (parsed !== baseValue) {
                    onEdit(event.id, { value: parsed, kind });
                  } else {
                    onEdit(event.id, null);
                  }
                }}
                placeholder={
                  event.id === "333fm" && kind === "s"
                    ? "moves"
                    : event.id === "333fm"
                      ? "25.33"
                      : "10.42 or 1:02.53"
                }
                className="w-32 rounded-md bg-black/40 px-2 py-1 text-sm ring-1 ring-white/15 focus:outline-none focus:ring-amber-300/60"
              />
              {edited && (
                <button
                  onClick={() => onEdit(event.id, null)}
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
                        line.newScore > baseScore
                          ? "text-emerald-400"
                          : line.newScore < baseScore
                            ? "text-rose-400"
                            : "text-white/40"
                      }
                    >
                      {line.newScore > baseScore ? "+" : ""}
                      {(line.newScore - baseScore).toFixed(2)}
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
  compId,
  compName,
  compDate,
  compCity,
  note,
}: {
  label: string;
  valueLabel: string;
  personName: string;
  personId: string | null;
  compId?: string | null;
  compName?: string | null;
  compDate?: string | null;
  compCity?: string | null;
  note?: string;
}) {
  return (
    <div className="border-t border-white/5 py-2 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-2">
        <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>
        {note && <div className="text-xs text-white/40">you {note}</div>}
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
        {compId && (
          <a
            href={wcaCompUrl(compId)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-white/55 underline-offset-2 hover:underline"
          >
            {compName ?? compId}
          </a>
        )}
        {compDate && <span className="text-xs text-white/45">{compDate}</span>}
        {compCity && <span className="text-xs text-white/45">· {compCity}</span>}
      </div>
    </div>
  );
}

function scoreHeat(s: number): string {
  if (s <= 0) return "text-white/30";
  return `h${Math.min(10, Math.floor(s / 10))}`;
}

function fmtScore(s: number): string {
  if (s <= 0) return "—";
  if (s >= 99.95) return "100";
  return s.toFixed(1);
}
