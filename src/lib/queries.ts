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
  rankOverall: number;
  rankContinent: number;
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

export async function fetchRankings(
  continentId: string | null,
): Promise<RankingRow[]> {
  const params: any[] = [];
  let where = "1=1";
  if (continentId) {
    where = "continent_id = ?";
    params.push(continentId);
  }
  const rows = await query<any>(
    `
    SELECT
      country_id      AS countryId,
      continent_id    AS continentId,
      kinch_score     AS kinchScore,
      rank_overall    AS rankOverall,
      rank_continent  AS rankContinent,
      event_scores    AS eventScores,
      event_values    AS eventValues,
      computed_at     AS computedAt
    FROM country_kinch_ranks
    WHERE ${where}
    ORDER BY kinch_score DESC
    `,
    params,
  );

  return rows.map((r) => ({
    countryId: r.countryId,
    countryName: countryName(r.countryId),
    continentId: r.continentId,
    continentName: continentName(r.continentId),
    kinchScore: Number(r.kinchScore),
    rankOverall: r.rankOverall,
    rankContinent: r.rankContinent,
    eventScores:
      typeof r.eventScores === "string"
        ? JSON.parse(r.eventScores)
        : r.eventScores ?? {},
    eventValues:
      typeof r.eventValues === "string"
        ? JSON.parse(r.eventValues)
        : r.eventValues ?? {},
    computedAt: new Date(r.computedAt),
  }));
}

export async function lastComputedAt(): Promise<Date | null> {
  const rows = await query<{ t: Date | null }>(
    "SELECT MAX(computed_at) AS t FROM country_kinch_ranks",
  );
  return rows[0]?.t ? new Date(rows[0].t) : null;
}
