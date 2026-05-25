import { query } from "./db";

export type GenderFilter = "all" | "m" | "f";

export interface Continent {
  id: string;
  name: string;
}

export interface Country {
  id: string;
  name: string;
  continentId: string;
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
  return query<Continent>(
    "SELECT id, name FROM Continents ORDER BY name ASC",
  );
}

export async function fetchRankings(
  gender: GenderFilter,
  continentId: string | null,
): Promise<RankingRow[]> {
  const params: any[] = [gender];
  let where = "k.gender = ?";
  if (continentId) {
    where += " AND k.continent_id = ?";
    params.push(continentId);
  }
  const rows = await query<any>(
    `
    SELECT
      k.country_id      AS countryId,
      c.name            AS countryName,
      k.continent_id    AS continentId,
      cn.name           AS continentName,
      k.kinch_score     AS kinchScore,
      k.rank_overall    AS rankOverall,
      k.rank_continent  AS rankContinent,
      k.event_scores    AS eventScores,
      k.event_values    AS eventValues,
      k.computed_at     AS computedAt
    FROM country_kinch_ranks k
    JOIN Countries  c  ON c.id  = k.country_id
    JOIN Continents cn ON cn.id = k.continent_id
    WHERE ${where}
    ORDER BY k.kinch_score DESC
    `,
    params,
  );

  return rows.map((r) => ({
    countryId: r.countryId,
    countryName: r.countryName,
    continentId: r.continentId,
    continentName: r.continentName,
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
