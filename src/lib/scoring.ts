import { multiBldKinchScore } from "./multibld";
import { KINCH_EVENTS } from "./events";
import type { Kind } from "./kinch";
import type { BoardRow, EventRefs, RefRow } from "./queries";

/**
 * Client-side what-if engine. Edits live in a single global structure
 * (country → event → edited value); the whole board is recomputed from raw
 * values + references, so an edit that beats a WR/CR becomes the new
 * reference and every other country's score reacts to it — exactly like a
 * real record would.
 */

export function kinchScore(eventId: string, value: number, ref: number): number {
  if (!value || value <= 0 || !ref || ref <= 0) return 0;
  if (eventId === "333mbf") {
    const s = multiBldKinchScore(value);
    const r = multiBldKinchScore(ref);
    return r > 0 ? (s / r) * 100 : 0;
  }
  return (ref / value) * 100;
}

export interface Edit {
  value: number;
  kind: Kind;
}

/** countryId → eventId → edit */
export type Edits = Record<string, Record<string, Edit>>;

export function countEdits(edits: Edits): number {
  let n = 0;
  for (const ev of Object.values(edits)) n += Object.keys(ev).length;
  return n;
}

export function refFor(
  refs: EventRefs,
  eventId: string,
  scope: "world" | string,
  kind: Kind,
): RefRow | null {
  return refs[eventId]?.[kind]?.[scope] ?? null;
}

/**
 * Reference value for an event/kind/scope after considering edits: if any
 * edited NR in scope beats the stored record, it becomes the reference.
 * (All WCA encodings are lower-is-better, including Multi-BLD.)
 */
export function effectiveRefValue(
  refs: EventRefs,
  eventId: string,
  kind: Kind,
  scope: "world" | string,
  edits: Edits,
  continentOf: (countryId: string) => string | undefined,
): number {
  let ref = refs[eventId]?.[kind]?.[scope]?.value ?? 0;
  for (const [cid, ev] of Object.entries(edits)) {
    const e = ev[eventId];
    if (!e || e.kind !== kind || e.value <= 0) continue;
    if (scope !== "world" && continentOf(cid) !== scope) continue;
    if (ref === 0 || e.value < ref) ref = e.value;
  }
  return ref;
}

export interface AdjustedCountry {
  kinch: number;
  rank: number;
  scores: Record<string, number>;
}

/**
 * Recompute the entire visible board under the current edits.
 * Returns one entry per country in scope, with competition-style ranking
 * (ties share a rank).
 */
export function adjustBoard(
  rows: BoardRow[],
  refs: EventRefs,
  edits: Edits,
  scope: "world" | string,
): Map<string, AdjustedCountry> {
  const contOfMap = new Map(rows.map((r) => [r.id, r.continent]));
  const contOf = (cid: string) => contOfMap.get(cid);

  const inScope =
    scope === "world" ? rows : rows.filter((r) => r.continent === scope);

  const refCache = new Map<string, number>();
  const getRef = (eventId: string, kind: Kind): number => {
    const key = `${eventId}|${kind}`;
    let v = refCache.get(key);
    if (v === undefined) {
      v = effectiveRefValue(refs, eventId, kind, scope, edits, contOf);
      refCache.set(key, v);
    }
    return v;
  };

  const result = new Map<string, AdjustedCountry>();
  for (const r of inScope) {
    let sum = 0;
    const scores: Record<string, number> = {};
    for (const e of KINCH_EVENTS) {
      const slot = r.e[e.id];
      const edit = edits[r.id]?.[e.id];
      const kind: Kind =
        edit?.kind ?? (scope === "world" ? slot?.kw : slot?.kc) ?? "a";
      const value =
        edit?.value ?? (scope === "world" ? slot?.vw : slot?.vc) ?? 0;
      const s = kinchScore(e.id, value, getRef(e.id, kind));
      scores[e.id] = s;
      sum += s;
    }
    result.set(r.id, { kinch: sum / KINCH_EVENTS.length, rank: 0, scores });
  }

  const sorted = Array.from(result.entries()).sort(
    (a, b) => b[1].kinch - a[1].kinch || a[0].localeCompare(b[0]),
  );
  let prev = NaN;
  let prevRank = 0;
  sorted.forEach(([, ac], i) => {
    const v = Number(ac.kinch.toFixed(4));
    ac.rank = v === prev ? prevRank : i + 1;
    prev = v;
    prevRank = ac.rank;
  });
  return result;
}
