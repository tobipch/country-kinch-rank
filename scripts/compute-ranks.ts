import "dotenv/config";
import { getPool, query } from "../src/lib/db";
import { KINCH_EVENTS, KinchEvent } from "../src/lib/events";
import { multiBldKinchScore } from "../src/lib/multibld";
import { isPseudoCountry } from "../src/lib/wca-meta";

interface PersonResult {
  person_id: string;
  best: number;
}

interface CountryBest {
  country_id: string;
  best: number;
}

interface CountryRow {
  country_id: string;
  continent_id: string;
}

/**
 * Convert (referenceBest, countryBest) to a comparable Kinch score, scaled 0–100.
 * referenceBest is the world or continent record we compare against.
 * For multibld we decode (points + hourLeft); for time/move events lower is better.
 */
function toKinchScore(eventId: string, value: number, reference: number): number {
  if (!value || value <= 0 || !reference || reference <= 0) return 0;
  if (eventId === "333mbf") {
    const s = multiBldKinchScore(value);
    const rs = multiBldKinchScore(reference);
    if (rs <= 0) return 0;
    return (s / rs) * 100;
  }
  return (reference / value) * 100;
}

/**
 * Fetch each result holder's best result for an event. We resolve the
 * *current* country via a JS lookup against the prebuilt persons map so we
 * don't depend on the (potentially stale) country_id stored on the ranks
 * tables or on a specific sub_id convention used by the importer.
 */
async function fetchEventResults(
  table: "ranks_single" | "ranks_average",
  eventId: string,
): Promise<PersonResult[]> {
  return query<PersonResult>(
    `SELECT person_id, best
     FROM ${table}
     WHERE event_id = ? AND best > 0`,
    [eventId],
  );
}

function aggregatePerCountry(
  results: PersonResult[],
  personCountry: Map<string, string>,
): CountryBest[] {
  const m = new Map<string, number>();
  for (const r of results) {
    const cid = personCountry.get(r.person_id);
    if (!cid) continue;
    const cur = m.get(cid);
    if (cur === undefined || r.best < cur) m.set(cid, r.best);
  }
  return Array.from(m, ([country_id, best]) => ({ country_id, best }));
}

interface EventDataset {
  event: KinchEvent;
  single?: CountryBest[];
  average?: CountryBest[];
}

async function loadEventData(
  event: KinchEvent,
  personCountry: Map<string, string>,
): Promise<EventDataset> {
  const agg = (rows: PersonResult[]) => aggregatePerCountry(rows, personCountry);
  if (event.type === "average") {
    const raw = await fetchEventResults("ranks_average", event.id);
    return { event, average: agg(raw) };
  }
  if (event.type === "single" || event.type === "multibld") {
    const raw = await fetchEventResults("ranks_single", event.id);
    return { event, single: agg(raw) };
  }
  const [s, a] = await Promise.all([
    fetchEventResults("ranks_single", event.id),
    fetchEventResults("ranks_average", event.id),
  ]);
  return { event, single: agg(s), average: agg(a) };
}

/**
 * Build wca_id → current country_id by picking the row with the smallest
 * sub_id per person. By WCA convention the lowest sub_id is the current
 * (active) entry; older country assignments live on higher sub_ids. This
 * sidesteps any importer-specific quirks around what value sub_id takes.
 */
async function loadPersonCountries(): Promise<Map<string, string>> {
  const rows = await query<{ wca_id: string; sub_id: number; country_id: string | null }>(
    `SELECT wca_id, sub_id, country_id
     FROM persons
     WHERE country_id IS NOT NULL
     ORDER BY wca_id, sub_id ASC`,
  );
  const m = new Map<string, string>();
  for (const r of rows) {
    if (!m.has(r.wca_id) && r.country_id) m.set(r.wca_id, r.country_id);
  }
  return m;
}

function toMap(rows: CountryBest[] | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!rows) return m;
  for (const r of rows) m.set(r.country_id, r.best);
  return m;
}

/** min of values in a map (best WCA result). */
function minOf(values: Iterable<number>): number {
  let m = 0;
  for (const v of values) if (m === 0 || v < m) m = v;
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
  const countriesByContinent = new Map<string, Set<string>>();
  for (const c of countries) {
    if (isPseudoCountry(c.country_id)) continue;
    if (!countriesByContinent.has(c.continent_id))
      countriesByContinent.set(c.continent_id, new Set());
    countriesByContinent.get(c.continent_id)!.add(c.country_id);
  }

  console.log("Loading persons…");
  const personCountry = await loadPersonCountries();
  console.log(`  ${personCountry.size} persons with a current country`);

  console.log(`Loading per-event data for ${KINCH_EVENTS.length} events…`);
  const datasets = await Promise.all(
    KINCH_EVENTS.map((e) => loadEventData(e, personCountry)),
  );
  const sampleCounts = datasets
    .map((d) => `${d.event.id}=${(d.single?.length ?? 0) + (d.average?.length ?? 0)}`)
    .join(", ");
  console.log(`  per-event country counts: ${sampleCounts}`);

  // perCountry[countryId] -> { eventId -> { value, scoreWorld, scoreCont } }
  type Slot = { value: number; scoreWorld: number; scoreCont: number };
  const perCountry = new Map<string, Record<string, Slot>>();

  for (const ds of datasets) {
    const singleMap = toMap(ds.single);
    const averageMap = toMap(ds.average);

    // World references
    const wrSingle = minOf(singleMap.values());
    const wrAverage = minOf(averageMap.values());

    // Continent references: best result among countries belonging to that continent
    const contRecSingle = new Map<string, number>();
    const contRecAverage = new Map<string, number>();
    for (const [contId, ids] of countriesByContinent) {
      const sVals: number[] = [];
      const aVals: number[] = [];
      for (const id of ids) {
        const sv = singleMap.get(id);
        const av = averageMap.get(id);
        if (sv) sVals.push(sv);
        if (av) aVals.push(av);
      }
      const sMin = minOf(sVals);
      const aMin = minOf(aVals);
      if (sMin) contRecSingle.set(contId, sMin);
      if (aMin) contRecAverage.set(contId, aMin);
    }

    const ids = new Set<string>([...singleMap.keys(), ...averageMap.keys()]);
    for (const cid of ids) {
      if (isPseudoCountry(cid)) continue;
      const contId = continentByCountry.get(cid);
      if (!contId) continue;

      const sv = singleMap.get(cid) ?? 0;
      const av = averageMap.get(cid) ?? 0;
      const sScoreW = sv ? toKinchScore(ds.event.id, sv, wrSingle) : 0;
      const aScoreW = av ? toKinchScore(ds.event.id, av, wrAverage) : 0;
      const sScoreC = sv ? toKinchScore(ds.event.id, sv, contRecSingle.get(contId) ?? 0) : 0;
      const aScoreC = av ? toKinchScore(ds.event.id, av, contRecAverage.get(contId) ?? 0) : 0;

      let value = 0;
      let scoreWorld = 0;
      let scoreCont = 0;
      if (ds.event.type === "best") {
        // Pick the variant that gives the better world score, then use the
        // matching variant's continent score so they describe the same result.
        if (sScoreW >= aScoreW) {
          value = sv;
          scoreWorld = sScoreW;
          scoreCont = sScoreC;
        } else {
          value = av;
          scoreWorld = aScoreW;
          scoreCont = aScoreC;
        }
      } else if (ds.event.type === "average") {
        value = av;
        scoreWorld = aScoreW;
        scoreCont = aScoreC;
      } else {
        value = sv;
        scoreWorld = sScoreW;
        scoreCont = sScoreC;
      }
      if (scoreWorld <= 0 && scoreCont <= 0) continue;

      let bucket = perCountry.get(cid);
      if (!bucket) {
        bucket = {};
        perCountry.set(cid, bucket);
      }
      bucket[ds.event.id] = { value, scoreWorld, scoreCont };
    }
  }

  interface Row {
    country_id: string;
    continent_id: string;
    kinch_world: number;
    kinch_cont: number;
    event_scores_world: Record<string, number>;
    event_scores_cont: Record<string, number>;
    event_values: Record<string, number>;
  }

  const rows: Row[] = [];
  for (const [cid, bucket] of perCountry) {
    const continent_id = continentByCountry.get(cid) ?? "";
    if (!continent_id) continue;
    let sumW = 0;
    let sumC = 0;
    const event_scores_world: Record<string, number> = {};
    const event_scores_cont: Record<string, number> = {};
    const event_values: Record<string, number> = {};
    for (const e of KINCH_EVENTS) {
      const slot = bucket[e.id];
      const sw = slot ? slot.scoreWorld : 0;
      const sc = slot ? slot.scoreCont : 0;
      sumW += sw;
      sumC += sc;
      event_scores_world[e.id] = Number(sw.toFixed(4));
      event_scores_cont[e.id] = Number(sc.toFixed(4));
      event_values[e.id] = slot ? slot.value : 0;
    }
    const kinch_world = sumW / KINCH_EVENTS.length;
    const kinch_cont = sumC / KINCH_EVENTS.length;
    if (kinch_world <= 0 && kinch_cont <= 0) continue;
    rows.push({
      country_id: cid,
      continent_id,
      kinch_world,
      kinch_cont,
      event_scores_world,
      event_scores_cont,
      event_values,
    });
  }

  // World rank by kinch_world; continent rank by kinch_cont within each continent.
  rows.sort((a, b) => b.kinch_world - a.kinch_world);
  const rankWorld = new Map<string, number>();
  rows.forEach((r, i) => rankWorld.set(r.country_id, i + 1));

  const rankCont = new Map<string, number>();
  const byCont = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byCont.has(r.continent_id)) byCont.set(r.continent_id, []);
    byCont.get(r.continent_id)!.push(r);
  }
  for (const list of byCont.values()) {
    list.sort((a, b) => b.kinch_cont - a.kinch_cont);
    list.forEach((r, i) => rankCont.set(r.country_id, i + 1));
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
        Number(r.kinch_world.toFixed(4)),
        Number(r.kinch_cont.toFixed(4)),
        JSON.stringify(r.event_scores_world),
        JSON.stringify(r.event_scores_cont),
        JSON.stringify(r.event_values),
        rankWorld.get(r.country_id)!,
        rankCont.get(r.country_id)!,
        now,
      ]);
      const placeholders = values.map(() => "(?,?,?,?,?,?,?,?,?,?)").join(",");
      await conn.query(
        `INSERT INTO country_kinch_ranks
          (country_id, continent_id, kinch_score_world, kinch_score_cont,
           event_scores_world, event_scores_cont, event_values,
           rank_world, rank_continent, computed_at)
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
