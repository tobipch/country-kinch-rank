import "dotenv/config";
import { getPool, query } from "../src/lib/db";
import { KINCH_EVENTS, KinchEvent } from "../src/lib/events";
import { multiBldKinchScore } from "../src/lib/multibld";

type Gender = "all" | "m" | "f";

interface PerEventRow {
  countryId: string;
  gender: string; // 'm' | 'f' | 'o' | ''
  best: number;
}

interface CountryAggregate {
  countryId: string;
  continentId: string;
  // per gender filter: per event id -> { score, value }
  perGender: Record<
    Gender,
    Record<string, { score: number; value: number }>
  >;
}

/** Convert a raw "best" value to a Kinch comparable score (higher = better). */
function toKinchScore(eventId: string, value: number, wr: number): number {
  if (!value || value <= 0 || !wr || wr <= 0) return 0;
  if (eventId === "333mbf") {
    const s = multiBldKinchScore(value);
    const wrScore = multiBldKinchScore(wr);
    if (wrScore <= 0) return 0;
    return (s / wrScore) * 100;
  }
  // time / moves: lower is better → wr / value
  return (wr / value) * 100;
}

/**
 * Fetch best per (country, gender) for a single event using ranks tables.
 * - 'all'   → group only by countryId
 * - 'm'/'f' → filter Persons.gender and group by countryId
 *
 * For 333mbf we need raw values per country to decode, but since the WCA
 * encoding orders best-first (min = best), MIN() is correct.
 */
async function fetchBestPerCountry(
  ranksTable: "RanksAverage" | "RanksSingle",
  eventId: string,
): Promise<PerEventRow[]> {
  const sql = `
    SELECT p.countryId AS countryId,
           COALESCE(p.gender,'') AS gender,
           MIN(r.best) AS best
    FROM ${ranksTable} r
    JOIN Persons p ON p.id = r.personId AND p.subid = 1
    WHERE r.eventId = ? AND r.best > 0
    GROUP BY p.countryId, COALESCE(p.gender,'')
  `;
  return query<PerEventRow>(sql, [eventId]);
}

/** Best across the world per gender filter (denominator). */
function worldBest(rows: PerEventRow[], gender: Gender): number {
  const filtered =
    gender === "all" ? rows : rows.filter((r) => r.gender === gender);
  if (filtered.length === 0) return 0;
  return filtered.reduce((m, r) => (m === 0 || r.best < m ? r.best : m), 0);
}

/** Best per country given gender filter. */
function bestPerCountry(
  rows: PerEventRow[],
  gender: Gender,
): Map<string, number> {
  const filtered =
    gender === "all" ? rows : rows.filter((r) => r.gender === gender);
  const out = new Map<string, number>();
  for (const r of filtered) {
    const cur = out.get(r.countryId);
    if (cur === undefined || r.best < cur) {
      out.set(r.countryId, r.best);
    }
  }
  return out;
}

interface EventDataset {
  event: KinchEvent;
  // For "best": both single and average rows. For others: just one.
  single?: PerEventRow[];
  average?: PerEventRow[];
}

async function loadEventData(event: KinchEvent): Promise<EventDataset> {
  if (event.type === "average") {
    return { event, average: await fetchBestPerCountry("RanksAverage", event.id) };
  }
  if (event.type === "single" || event.type === "multibld") {
    return { event, single: await fetchBestPerCountry("RanksSingle", event.id) };
  }
  // "best": both
  const [single, average] = await Promise.all([
    fetchBestPerCountry("RanksSingle", event.id),
    fetchBestPerCountry("RanksAverage", event.id),
  ]);
  return { event, single, average };
}

async function main() {
  const pool = getPool();
  console.log("Loading countries…");
  const countries = await query<{ id: string; continentId: string }>(
    "SELECT id, continentId FROM Countries",
  );
  const continentByCountry = new Map(countries.map((c) => [c.id, c.continentId]));

  console.log("Loading per-event data for 18 events…");
  const datasets = await Promise.all(KINCH_EVENTS.map((e) => loadEventData(e)));
  console.log("  done");

  const genders: Gender[] = ["all", "m", "f"];
  // countryId -> gender -> eventId -> {score, value}
  const acc = new Map<string, CountryAggregate>();

  function ensure(countryId: string): CountryAggregate {
    let entry = acc.get(countryId);
    if (!entry) {
      entry = {
        countryId,
        continentId: continentByCountry.get(countryId) ?? "",
        perGender: { all: {}, m: {}, f: {} },
      };
      acc.set(countryId, entry);
    }
    return entry;
  }

  for (const ds of datasets) {
    const { event } = ds;

    for (const gender of genders) {
      let wrSingle = 0;
      let wrAverage = 0;
      if (ds.single) wrSingle = worldBest(ds.single, gender);
      if (ds.average) wrAverage = worldBest(ds.average, gender);

      const singlePerCountry = ds.single
        ? bestPerCountry(ds.single, gender)
        : new Map<string, number>();
      const averagePerCountry = ds.average
        ? bestPerCountry(ds.average, gender)
        : new Map<string, number>();

      const allCountryIds = new Set<string>([
        ...singlePerCountry.keys(),
        ...averagePerCountry.keys(),
      ]);

      for (const countryId of allCountryIds) {
        const sv = singlePerCountry.get(countryId) ?? 0;
        const av = averagePerCountry.get(countryId) ?? 0;
        const sScore = sv ? toKinchScore(event.id, sv, wrSingle) : 0;
        const aScore = av ? toKinchScore(event.id, av, wrAverage) : 0;

        let chosenScore = 0;
        let chosenValue = 0;
        if (event.type === "best") {
          if (sScore >= aScore) {
            chosenScore = sScore;
            chosenValue = sv;
          } else {
            chosenScore = aScore;
            chosenValue = av;
          }
        } else if (event.type === "average") {
          chosenScore = aScore;
          chosenValue = av;
        } else {
          chosenScore = sScore;
          chosenValue = sv;
        }
        if (chosenScore > 0) {
          const entry = ensure(countryId);
          entry.perGender[gender][event.id] = {
            score: chosenScore,
            value: chosenValue,
          };
        }
      }
    }
  }

  // Compute average across 18 events per country/gender.
  interface Row {
    countryId: string;
    continentId: string;
    gender: Gender;
    score: number;
    eventScores: Record<string, number>;
    eventValues: Record<string, number>;
  }
  const allRows: Row[] = [];
  for (const entry of acc.values()) {
    for (const gender of genders) {
      const perEvent = entry.perGender[gender];
      let sum = 0;
      const eventScores: Record<string, number> = {};
      const eventValues: Record<string, number> = {};
      for (const e of KINCH_EVENTS) {
        const slot = perEvent[e.id];
        const s = slot ? slot.score : 0;
        sum += s;
        eventScores[e.id] = Number(s.toFixed(4));
        eventValues[e.id] = slot ? slot.value : 0;
      }
      const score = sum / KINCH_EVENTS.length;
      if (score <= 0) continue;
      allRows.push({
        countryId: entry.countryId,
        continentId: entry.continentId,
        gender,
        score,
        eventScores,
        eventValues,
      });
    }
  }

  // Rank globally per gender, and per continent per gender.
  const byGender = new Map<Gender, Row[]>();
  for (const r of allRows) {
    if (!byGender.has(r.gender)) byGender.set(r.gender, []);
    byGender.get(r.gender)!.push(r);
  }
  const rankMap = new Map<string, { overall: number; continent: number }>();
  for (const [, rows] of byGender) {
    rows.sort((a, b) => b.score - a.score);
    rows.forEach((r, i) => {
      const k = `${r.countryId}|${r.gender}`;
      rankMap.set(k, { overall: i + 1, continent: 0 });
    });
    const byCont = new Map<string, Row[]>();
    for (const r of rows) {
      if (!byCont.has(r.continentId)) byCont.set(r.continentId, []);
      byCont.get(r.continentId)!.push(r);
    }
    for (const [, list] of byCont) {
      list.sort((a, b) => b.score - a.score);
      list.forEach((r, i) => {
        const k = `${r.countryId}|${r.gender}`;
        const ex = rankMap.get(k)!;
        ex.continent = i + 1;
      });
    }
  }

  console.log(`Writing ${allRows.length} rows…`);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM country_kinch_ranks");
    const now = new Date();
    const batchSize = 200;
    for (let i = 0; i < allRows.length; i += batchSize) {
      const batch = allRows.slice(i, i + batchSize);
      const values = batch.map((r) => {
        const ranks = rankMap.get(`${r.countryId}|${r.gender}`)!;
        return [
          r.countryId,
          r.continentId,
          r.gender,
          Number(r.score.toFixed(4)),
          JSON.stringify(r.eventScores),
          JSON.stringify(r.eventValues),
          ranks.overall,
          ranks.continent,
          now,
        ];
      });
      const placeholders = values.map(() => "(?,?,?,?,?,?,?,?,?)").join(",");
      await conn.query(
        `INSERT INTO country_kinch_ranks
          (country_id, continent_id, gender, kinch_score, event_scores, event_values, rank_overall, rank_continent, computed_at)
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
