import { query } from "./db";
import { KINCH_EVENTS } from "./events";
import {
  continentName,
  countryCode,
  countryName,
} from "./wca-meta";
import type { Kind } from "./kinch";

export interface HolderInfo {
  i: string;
  n: string;
  c: string | null;
  cn: string | null;
  d: string | null;
  ct: string | null;
}

/**
 * One country's data for one event. Both single (`vs`/`hs`) and average
 * (`va`/`ha`) sides are stored so the what-if editor can show / edit each
 * independently for "best of single or average" events (3BLD, FM).
 * `sw/sc` are the precomputed display scores (max of the two for best
 * events), `kw/kc` indicate which kind those scores came from.
 */
export interface EventSlot {
  vs: number;
  va: number;
  hs: HolderInfo | null;
  ha: HolderInfo | null;
  sw: number;
  sc: number;
  kw: Kind;
  kc: Kind;
}

export interface BoardRow {
  id: string;
  name: string;
  code: string | null;
  continent: string;
  kw: number;
  rw: number;
  kc: number;
  rc: number;
  e: Record<string, EventSlot>;
}

export interface RefRow {
  kind: Kind;
  value: number;
  countryId: string;
  countryName: string;
  code: string | null;
  personId: string;
  personName: string;
  compId: string | null;
  compName: string | null;
  compDate: string | null;
  compCity: string | null;
}

export type EventRefs = Record<string, Record<Kind, Record<string, RefRow>>>;

export interface ContinentInfo {
  id: string;
  name: string;
}

export interface BoardData {
  rows: BoardRow[];
  continents: ContinentInfo[];
  refs: EventRefs;
  computedAt: string | null;
}

export async function fetchBoard(): Promise<BoardData> {
  const [rankRows, refRows] = await Promise.all([
    query<any>(
      `SELECT country_id, continent_id, kinch_score_world, kinch_score_cont,
              rank_world, rank_continent, event_data, computed_at
       FROM country_kinch_ranks
       ORDER BY rank_world ASC, country_id ASC`,
    ),
    query<any>(
      `SELECT event_id, scope_id, kind, value, country_id, person_id,
              person_name, comp_id, comp_name, comp_date, comp_city
       FROM country_kinch_refs`,
    ),
  ]);

  const rows: BoardRow[] = rankRows.map((r) => {
    const data =
      typeof r.event_data === "string"
        ? JSON.parse(r.event_data)
        : r.event_data ?? {};
    const e: Record<string, EventSlot> = {};
    for (const ev of KINCH_EVENTS) {
      const d = data[ev.id] ?? {};
      e[ev.id] = {
        vs: Number(d.vs ?? 0),
        va: Number(d.va ?? 0),
        hs: d.hs ?? null,
        ha: d.ha ?? null,
        sw: Number(d.sw ?? 0),
        sc: Number(d.sc ?? 0),
        kw: (d.kw ?? "a") as Kind,
        kc: (d.kc ?? "a") as Kind,
      };
    }
    return {
      id: r.country_id,
      name: countryName(r.country_id),
      code: countryCode(r.country_id),
      continent: r.continent_id,
      kw: Number(r.kinch_score_world),
      rw: r.rank_world,
      kc: Number(r.kinch_score_cont),
      rc: r.rank_continent,
      e,
    };
  });

  const refs: EventRefs = {};
  for (const r of refRows) {
    const ev = (refs[r.event_id] ??= { s: {}, a: {} } as any);
    const kindMap = ev[r.kind as Kind];
    kindMap[r.scope_id] = {
      kind: r.kind,
      value: r.value,
      countryId: r.country_id,
      countryName: countryName(r.country_id),
      code: countryCode(r.country_id),
      personId: r.person_id,
      personName: r.person_name,
      compId: r.comp_id,
      compName: r.comp_name,
      compDate: r.comp_date
        ? new Date(r.comp_date).toISOString().slice(0, 10)
        : null,
      compCity: r.comp_city,
    };
  }

  const continentIds = Array.from(new Set(rows.map((r) => r.continent)));
  const continents = continentIds
    .map((id) => ({ id, name: continentName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const computedAt = rankRows[0]?.computed_at
    ? new Date(rankRows[0].computed_at).toISOString()
    : null;

  return { rows, continents, refs, computedAt };
}
