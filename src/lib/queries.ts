import { query } from "./db";
import { KINCH_EVENTS } from "./events";
import { continentName, countryCode, countryName } from "./wca-meta";

/**
 * Compact board payload: one row per country with both score sets
 * (world-record based and continental-record based) as plain arrays in
 * KINCH_EVENTS order. Loaded once per revalidation; the continent filter
 * runs entirely client-side.
 */
export interface BoardRow {
  id: string;
  name: string;
  /** ISO alpha-2 for the flag, or null. */
  code: string | null;
  continent: string;
  /** Kinch score / rank, world-record based. */
  kw: number;
  rw: number;
  /** Kinch score / rank, continental-record based. */
  kc: number;
  rc: number;
  /** Per-event scores in KINCH_EVENTS order, rounded to 1 decimal. */
  sw: number[];
  sc: number[];
}

export interface ContinentInfo {
  id: string;
  name: string;
}

export interface BoardData {
  rows: BoardRow[];
  continents: ContinentInfo[];
  computedAt: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function fetchBoard(): Promise<BoardData> {
  const raw = await query<any>(
    `SELECT country_id, continent_id, kinch_score_world, kinch_score_cont,
            rank_world, rank_continent, event_data, computed_at
     FROM country_kinch_ranks
     ORDER BY rank_world ASC, country_id ASC`,
  );

  const rows: BoardRow[] = raw.map((r) => {
    const data =
      typeof r.event_data === "string"
        ? JSON.parse(r.event_data)
        : r.event_data ?? {};
    return {
      id: r.country_id,
      name: countryName(r.country_id),
      code: countryCode(r.country_id),
      continent: r.continent_id,
      kw: Number(r.kinch_score_world),
      rw: r.rank_world,
      kc: Number(r.kinch_score_cont),
      rc: r.rank_continent,
      sw: KINCH_EVENTS.map((e) => round1(data[e.id]?.sw ?? 0)),
      sc: KINCH_EVENTS.map((e) => round1(data[e.id]?.sc ?? 0)),
    };
  });

  const continentIds = Array.from(new Set(rows.map((r) => r.continent)));
  const continents = continentIds
    .map((id) => ({ id, name: continentName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const computedAt = raw[0]?.computed_at
    ? new Date(raw[0].computed_at).toISOString()
    : null;

  return { rows, continents, computedAt };
}
