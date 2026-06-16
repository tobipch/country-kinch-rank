import "dotenv/config";
import { getPool } from "../src/lib/db";
import {
  computeAll,
  type BestResult,
  type CountryKinch,
  bestKindScore,
} from "../src/lib/kinch";
import { KINCH_EVENTS } from "../src/lib/events";

function refRow(
  eventId: string,
  scopeId: string,
  kind: "s" | "a",
  br: BestResult,
) {
  return [
    eventId,
    scopeId,
    kind,
    br.value,
    br.countryId,
    br.personId,
    br.personName,
    br.comp?.id ?? null,
    br.comp?.name ?? null,
    br.comp?.date ?? null,
    br.comp?.city ?? null,
  ];
}

function compactHolder(h: BestResult | null) {
  if (!h) return null;
  return {
    i: h.personId,
    n: h.personName,
    c: h.comp?.id ?? null,
    cn: h.comp?.name ?? null,
    d: h.comp?.date ?? null,
    ct: h.comp?.city ?? null,
  };
}

function buildEventData(c: CountryKinch): Record<string, any> {
  const data: Record<string, any> = {};
  for (const e of KINCH_EVENTS) {
    const slot = c.events[e.id] ?? { world: { s: null, a: null }, cont: { s: null, a: null } };
    const w = bestKindScore(slot.world, e);
    const k = bestKindScore(slot.cont, e);
    data[e.id] = {
      vs: slot.world.s?.value ?? 0,
      va: slot.world.a?.value ?? 0,
      hs: compactHolder(slot.world.s?.holder ?? null),
      ha: compactHolder(slot.world.a?.holder ?? null),
      sw: Number(w.score.toFixed(2)),
      kw: w.kind,
      sc: Number(k.score.toFixed(2)),
      kc: k.kind,
    };
  }
  return data;
}

async function main() {
  const pool = getPool();

  console.log("Computing Kinch ranks…");
  const { countries, events } = await computeAll();
  console.log(`  ${countries.length} countries with at least one result`);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query("DELETE FROM country_kinch_refs");
    const refRows: any[][] = [];
    for (const ed of events) {
      for (const side of [
        { kind: "s" as const, data: ed.single },
        { kind: "a" as const, data: ed.average },
      ]) {
        if (!side.data) continue;
        if (side.data.worldRef) {
          refRows.push(refRow(ed.event.id, "world", side.kind, side.data.worldRef));
        }
        for (const [contId, br] of side.data.contRef) {
          refRows.push(refRow(ed.event.id, contId, side.kind, br));
        }
      }
    }
    if (refRows.length > 0) {
      const placeholders = refRows.map(() => "(?,?,?,?,?,?,?,?,?,?,?)").join(",");
      await conn.query(
        `INSERT INTO country_kinch_refs
          (event_id, scope_id, kind, value, country_id, person_id, person_name,
           comp_id, comp_name, comp_date, comp_city)
         VALUES ${placeholders}`,
        refRows.flat(),
      );
    }

    await conn.query("DELETE FROM country_kinch_ranks");
    const now = new Date();
    const batchSize = 100;
    for (let i = 0; i < countries.length; i += batchSize) {
      const batch = countries.slice(i, i + batchSize);
      const values = batch.map((c) => [
        c.countryId,
        c.continentId,
        Number(c.kinchWorld.toFixed(4)),
        Number(c.kinchCont.toFixed(4)),
        JSON.stringify(buildEventData(c)),
        c.rankWorld,
        c.rankCont,
        now,
      ]);
      const placeholders = values.map(() => "(?,?,?,?,?,?,?,?)").join(",");
      await conn.query(
        `INSERT INTO country_kinch_ranks
          (country_id, continent_id, kinch_score_world, kinch_score_cont,
           event_data, rank_world, rank_continent, computed_at)
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
