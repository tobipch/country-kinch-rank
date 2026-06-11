import { query } from "./db";
import { continentName, countryName } from "./wca-meta";
import type { Kind } from "./kinch";

export interface Continent {
  id: string;
  name: string;
}

export interface RankingRow {
  countryId: string;
  countryName: string;
  continentId: string;
  continentName: string;
  kinchScore: number;
  rank: number;
  eventScores: Record<string, number>;
  eventValues: Record<string, number>;
  eventKinds: Record<string, Kind>;
  computedAt: Date;
}

interface StoredEventData {
  [eventId: string]: {
    sw: number;
    vw: number;
    kw: Kind;
    sc: number;
    vc: number;
    kc: Kind;
  };
}

export async function listContinents(): Promise<Continent[]> {
  const rows = await query<{ continent_id: string }>(
    `SELECT DISTINCT continent_id
     FROM country_kinch_ranks
     WHERE continent_id <> ''
     ORDER BY continent_id`,
  );
  return rows
    .map((r) => ({ id: r.continent_id, name: continentName(r.continent_id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Without a continent filter, scores/ranks are world-record based.
 * With a continent filter, only that continent's countries are returned and
 * scores/ranks are based on the continental records.
 */
export async function fetchRankings(
  continentId: string | null,
): Promise<RankingRow[]> {
  const scoreCol = continentId ? "kinch_score_cont" : "kinch_score_world";
  const rankCol = continentId ? "rank_continent" : "rank_world";
  const params: any[] = [];
  let where = "1=1";
  if (continentId) {
    where = "continent_id = ?";
    params.push(continentId);
  }

  const rows = await query<any>(
    `
    SELECT
      country_id   AS countryId,
      continent_id AS continentId,
      ${scoreCol}  AS kinchScore,
      ${rankCol}   AS rank,
      event_data   AS eventData,
      computed_at  AS computedAt
    FROM country_kinch_ranks
    WHERE ${where}
    ORDER BY ${scoreCol} DESC, country_id ASC
    `,
    params,
  );

  return rows.map((r) => mapRow(r, !!continentId));
}

function mapRow(r: any, continental: boolean): RankingRow {
  const data: StoredEventData =
    typeof r.eventData === "string"
      ? JSON.parse(r.eventData)
      : r.eventData ?? {};

  const eventScores: Record<string, number> = {};
  const eventValues: Record<string, number> = {};
  const eventKinds: Record<string, Kind> = {};
  for (const [eventId, d] of Object.entries(data)) {
    eventScores[eventId] = continental ? d.sc : d.sw;
    eventValues[eventId] = continental ? d.vc : d.vw;
    eventKinds[eventId] = continental ? d.kc : d.kw;
  }

  return {
    countryId: r.countryId,
    countryName: countryName(r.countryId),
    continentId: r.continentId,
    continentName: continentName(r.continentId),
    kinchScore: Number(r.kinchScore),
    rank: r.rank,
    eventScores,
    eventValues,
    eventKinds,
    computedAt: new Date(r.computedAt),
  };
}

export async function lastComputedAt(): Promise<Date | null> {
  const rows = await query<{ t: Date | null }>(
    "SELECT MAX(computed_at) AS t FROM country_kinch_ranks",
  );
  return rows[0]?.t ? new Date(rows[0].t) : null;
}
