import { query } from "./db";
import { continentName, countryName } from "./wca-meta";

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
  computedAt: Date;
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
 * If `continentId` is given, scores and ranks are computed relative to that
 * continent's records and only countries in that continent are returned.
 * Otherwise, world-record-based scores and world ranks are returned.
 */
export async function fetchRankings(
  continentId: string | null,
): Promise<RankingRow[]> {
  if (continentId) {
    const rows = await query<any>(
      `
      SELECT
        country_id        AS countryId,
        continent_id      AS continentId,
        kinch_score_cont  AS kinchScore,
        rank_continent    AS rank,
        event_scores_cont AS eventScores,
        event_values      AS eventValues,
        computed_at       AS computedAt
      FROM country_kinch_ranks
      WHERE continent_id = ?
      ORDER BY kinch_score_cont DESC
      `,
      [continentId],
    );
    return rows.map(mapRow);
  }

  const rows = await query<any>(
    `
    SELECT
      country_id         AS countryId,
      continent_id       AS continentId,
      kinch_score_world  AS kinchScore,
      rank_world         AS rank,
      event_scores_world AS eventScores,
      event_values       AS eventValues,
      computed_at        AS computedAt
    FROM country_kinch_ranks
    ORDER BY kinch_score_world DESC
    `,
  );
  return rows.map(mapRow);
}

function mapRow(r: any): RankingRow {
  return {
    countryId: r.countryId,
    countryName: countryName(r.countryId),
    continentId: r.continentId,
    continentName: continentName(r.continentId),
    kinchScore: Number(r.kinchScore),
    rank: r.rank,
    eventScores:
      typeof r.eventScores === "string"
        ? JSON.parse(r.eventScores)
        : r.eventScores ?? {},
    eventValues:
      typeof r.eventValues === "string"
        ? JSON.parse(r.eventValues)
        : r.eventValues ?? {},
    computedAt: new Date(r.computedAt),
  };
}

export async function lastComputedAt(): Promise<Date | null> {
  const rows = await query<{ t: Date | null }>(
    "SELECT MAX(computed_at) AS t FROM country_kinch_ranks",
  );
  return rows[0]?.t ? new Date(rows[0].t) : null;
}
