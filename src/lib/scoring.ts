import { multiBldKinchScore } from "./multibld";
import { KINCH_EVENTS } from "./events";
import type { BoardRow, EventRefs, RefRow } from "./queries";

/**
 * Client-side mirror of kinch.ts scoring. Used by the what-if simulator so
 * the user can edit NRs and see new Kinch scores / new ranks instantly,
 * without round-tripping to the server.
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

export interface SimEvent {
  /** Selected value for this event (single or average depending on kind). */
  value: number;
  kind: "s" | "a";
}

export type SimState = Record<string, SimEvent>;

function refValue(
  refs: EventRefs,
  eventId: string,
  scope: string,
  kind: "s" | "a",
): number {
  return refs[eventId]?.[kind]?.[scope]?.value ?? 0;
}

export function simulateKinch(
  refs: EventRefs,
  sim: SimState,
  scope: "world" | string,
): number {
  let sum = 0;
  for (const e of KINCH_EVENTS) {
    const slot = sim[e.id];
    if (!slot) continue;
    const ref = refValue(refs, e.id, scope, slot.kind);
    sum += kinchScore(e.id, slot.value, ref);
  }
  return sum / KINCH_EVENTS.length;
}

/**
 * What rank would `newScore` get? Compares against the *other* countries'
 * stored kinch_score so the simulation places the edited country precisely.
 */
export function rankAmong(
  rows: BoardRow[],
  selfId: string,
  newScore: number,
  scope: "world" | string,
): number {
  const competitors =
    scope === "world"
      ? rows
      : rows.filter((r) => r.continent === scope);
  let rank = 1;
  for (const r of competitors) {
    if (r.id === selfId) continue;
    const s = scope === "world" ? r.kw : r.kc;
    if (s > newScore) rank++;
  }
  return rank;
}

/** Returns the world or continental refs for a given event. */
export function refFor(
  refs: EventRefs,
  eventId: string,
  scope: "world" | string,
  kind: "s" | "a",
): RefRow | null {
  return refs[eventId]?.[kind]?.[scope] ?? null;
}
