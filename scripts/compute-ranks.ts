import "dotenv/config";
import { getPool, query } from "../src/lib/db";
import { KINCH_EVENTS, KinchEvent } from "../src/lib/events";
import { multiBldKinchScore } from "../src/lib/multibld";
import { isPseudoCountry } from "../src/lib/wca-meta";

interface CountryBest {
  country_id: string;
  best: number;
}

interface CountryRow {
  country_id: string;
  continent_id: string;
}

/**
 * Convert a raw "best" value to a Kinch comparable score (higher = better).
 * For multibld we decode (points + hourLeft) and normalise by the WR's score.
 * For time/move events lower is better, so score = wr / value * 100.
 */
function toKinchScore(eventId: string, value: number, wr: number): number {
  if (!value || value <= 0 || !wr || wr <= 0) return 0;
  if (eventId === "333mbf") {
    const s = multiBldKinchScore(value);
    const wrScore = multiBldKinchScore(wr);
    if (wrScore <= 0) return 0;
    return (s / wrScore) * 100;
  }
  return (wr / value) * 100;
}

async function fetchBestPerCountry(
  table: "ranks_single" | "ranks_average",
  eventId: string,
): Promise<CountryBest[]> {
  return query<CountryBest>(
    `
    SELECT country_id, MIN(best) AS best
    FROM ${table}
    WHERE event_id = ? AND best > 0 AND country_id IS NOT NULL
    GROUP BY country_id
    `,
    [eventId],
  );
}

interface EventDataset {
  event: KinchEvent;
  single?: CountryBest[];
  average?: CountryBest[];
}

async function loadEventData(event: KinchEvent): Promise<EventDataset> {
  if (event.type === "average") {
    return { event, average: await fetchBestPerCountry("ranks_average", event.id) };
  }
  if (event.type === "single" || event.type === "multibld") {
    return { event, single: await fetchBestPerCountry("ranks_single", event.id) };
  }
  // "best": both single and average
  const [single, average] = await Promise.all([
    fetchBestPerCountry("ranks_single", event.id),
    fetchBestPerCountry("ranks_average", event.id),
  ]);
  return { event, single, average };
}

function worldBest(rows: CountryBest[] | undefined): number {
  if (!rows || rows.length === 0) return 0;
  return rows.reduce((m, r) => (m === 0 || r.best < m ? r.best : m), 0);
}

function toMap(rows: CountryBest[] | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!rows) return m;
  for (const r of rows) m.set(r.country_id, r.best);
  return m;
}

async function main() {
  const pool = getPool();

  console.log("Loading countries…");
  const countries = await query<CountryRow>(
    "SELECT id AS country_id, continent_id FROM countries WHERE continent_id IS NOT NULL",
  );
  const continentByCountry = new Map(
    countries.map((c) => [c.country_id, c.continent_id]),
  );

  console.log(`Loading per-event data for ${KINCH_EVENTS.length} events…`);
  const datasets = await Promise.all(KINCH_EVENTS.map((e) => loadEventData(e)));
  console.log("  done");

  // countryId -> { eventId -> { score, value } }
  const perCountry = new Map<string, Record<string, { score: number; value: number }>>();

  for (const ds of datasets) {
    const wrSingle = worldBest(ds.single);
    const wrAverage = worldBest(ds.average);
    const singleMap = toMap(ds.single);
    const averageMap = toMap(ds.average);
    const ids = new Set<string>([...singleMap.keys(), ...averageMap.keys()]);

    for (const cid of ids) {
      if (isPseudoCountry(cid)) continue;
      const sv = singleMap.get(cid) ?? 0;
      const av = averageMap.get(cid) ?? 0;
      const sScore = sv ? toKinchScore(ds.event.id, sv, wrSingle) : 0;
      const aScore = av ? toKinchScore(ds.event.id, av, wrAverage) : 0;

      let score = 0;
      let value = 0;
      if (ds.event.type === "best") {
        if (sScore >= aScore) {
          score = sScore;
          value = sv;
        } else {
          score = aScore;
          value = av;
        }
      } else if (ds.event.type === "average") {
        score = aScore;
        value = av;
      } else {
        score = sScore;
        value = sv;
      }
      if (score <= 0) continue;

      let bucket = perCountry.get(cid);
      if (!bucket) {
        bucket = {};
        perCountry.set(cid, bucket);
      }
      bucket[ds.event.id] = { score, value };
    }
  }

  interface Row {
    country_id: string;
    continent_id: string;
    kinch_score: number;
    event_scores: Record<string, number>;
    event_values: Record<string, number>;
  }

  const rows: Row[] = [];
  for (const [cid, bucket] of perCountry) {
    const continentId = continentByCountry.get(cid) ?? "";
    if (!continentId) continue;
    let sum = 0;
    const event_scores: Record<string, number> = {};
    const event_values: Record<string, number> = {};
    for (const e of KINCH_EVENTS) {
      const slot = bucket[e.id];
      const s = slot ? slot.score : 0;
      sum += s;
      event_scores[e.id] = Number(s.toFixed(4));
      event_values[e.id] = slot ? slot.value : 0;
    }
    const kinch = sum / KINCH_EVENTS.length;
    if (kinch <= 0) continue;
    rows.push({
      country_id: cid,
      continent_id: continentId,
      kinch_score: kinch,
      event_scores,
      event_values,
    });
  }

  // Rank globally and per continent.
  rows.sort((a, b) => b.kinch_score - a.kinch_score);
  const rankOverall = new Map<string, number>();
  rows.forEach((r, i) => rankOverall.set(r.country_id, i + 1));

  const rankContinent = new Map<string, number>();
  const byCont = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byCont.has(r.continent_id)) byCont.set(r.continent_id, []);
    byCont.get(r.continent_id)!.push(r);
  }
  for (const list of byCont.values()) {
    list.sort((a, b) => b.kinch_score - a.kinch_score);
    list.forEach((r, i) => rankContinent.set(r.country_id, i + 1));
  }

  console.log(`Writing ${rows.length} rows…`);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM country_kinch_ranks");
    const now = new Date();
    const batchSize = 200;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const values = batch.map((r) => [
        r.country_id,
        r.continent_id,
        Number(r.kinch_score.toFixed(4)),
        JSON.stringify(r.event_scores),
        JSON.stringify(r.event_values),
        rankOverall.get(r.country_id)!,
        rankContinent.get(r.country_id)!,
        now,
      ]);
      const placeholders = values.map(() => "(?,?,?,?,?,?,?,?)").join(",");
      await conn.query(
        `INSERT INTO country_kinch_ranks
          (country_id, continent_id, kinch_score, event_scores, event_values,
           rank_overall, rank_continent, computed_at)
         VALUES ${placeholders}`,
        values.flat(),
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  console.log("Done.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
