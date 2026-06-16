import { multiBldKinchScore } from "./multibld";
import { KINCH_EVENTS, type KinchEvent } from "./events";
import type { Kind } from "./kinch";
import type { BoardRow, EventRefs, RefRow } from "./queries";

/**
 * Client-side what-if engine. Edits live in a single global structure
 * (country → event → {single?, average?}). Both single and average values
 * for an event can be edited independently for "best" events. The whole
 * board is recomputed from raw values + references on each edit, so an
 * edit that beats a WR/CR becomes the new reference and every other
 * country's score reacts to it.
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

export function eventNeedsSingle(e: KinchEvent): boolean {
  return e.type !== "average";
}
export function eventNeedsAverage(e: KinchEvent): boolean {
  return e.type === "average" || e.type === "best";
}
/** True if the event supports both kinds (3BLD, FM). */
export function eventHasBothKinds(e: KinchEvent): boolean {
  return e.type === "best";
}

/**
 * Per-event edit. `single` and `average` are tracked independently:
 *   - undefined → not edited, fall back to the stored NR for that kind
 *   - 0         → user cleared this kind (treat as "no result")
 *   - >0        → user-entered hypothetical NR
 */
export interface Edit {
  single?: number;
  average?: number;
}

export type Edits = Record<string, Record<string, Edit>>;

export function countEdits(edits: Edits): number {
  let n = 0;
  for (const ev of Object.values(edits)) {
    for (const e of Object.values(ev)) {
      if (e.single !== undefined) n++;
      if (e.average !== undefined) n++;
    }
  }
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
    if (!e) continue;
    const v = kind === "s" ? e.single : e.average;
    if (v === undefined || v <= 0) continue;
    if (scope !== "world" && continentOf(cid) !== scope) continue;
    if (ref === 0 || v < ref) ref = v;
  }
  return ref;
}

export interface AdjustedCountry {
  kinch: number;
  rank: number;
  /** Max score for the event (best of single/avg for "best" events). */
  scores: Record<string, number>;
  /** Per-event per-kind score after edits. */
  kindScores: Record<string, { s: number; a: number }>;
  /** Per-event per-kind effective value after edits. */
  values: Record<string, { s: number; a: number }>;
  /** Per-event chosen kind for the displayed score. */
  chosenKind: Record<string, Kind>;
}

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
    const kindScores: Record<string, { s: number; a: number }> = {};
    const values: Record<string, { s: number; a: number }> = {};
    const chosenKind: Record<string, Kind> = {};
    for (const e of KINCH_EVENTS) {
      const slot = r.e[e.id];
      const edit = edits[r.id]?.[e.id];
      const vs = edit?.single ?? slot?.vs ?? 0;
      const va = edit?.average ?? slot?.va ?? 0;
      const sScore =
        eventNeedsSingle(e) && vs > 0
          ? kinchScore(e.id, vs, getRef(e.id, "s"))
          : 0;
      const aScore =
        eventNeedsAverage(e) && va > 0
          ? kinchScore(e.id, va, getRef(e.id, "a"))
          : 0;
      let best = 0;
      let kind: Kind = "a";
      if (e.type === "average") {
        best = aScore;
        kind = "a";
      } else if (e.type === "single" || e.type === "multibld") {
        best = sScore;
        kind = "s";
      } else {
        // "best"
        if (sScore >= aScore) {
          best = sScore;
          kind = "s";
        } else {
          best = aScore;
          kind = "a";
        }
      }
      scores[e.id] = best;
      kindScores[e.id] = { s: sScore, a: aScore };
      values[e.id] = { s: vs, a: va };
      chosenKind[e.id] = kind;
      sum += best;
    }
    result.set(r.id, {
      kinch: sum / KINCH_EVENTS.length,
      rank: 0,
      scores,
      kindScores,
      values,
      chosenKind,
    });
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
