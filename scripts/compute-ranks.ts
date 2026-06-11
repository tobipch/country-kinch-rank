import "dotenv/config";
import { getPool } from "../src/lib/db";
import { computeAll, type BestResult, type EventData } from "../src/lib/kinch";
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

async function main() {
  const pool = getPool();

  console.log("Computing Kinch ranks…");
  const { countries, events } = await computeAll();
  console.log(`  ${countries.length} countries with at least one result`);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // refs (WR + per-continent CR for every event, both kinds where applicable)
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

    // ranks (one row per country)
    await conn.query("DELETE FROM country_kinch_ranks");
    const now = new Date();
    const batchSize = 100;
    for (let i = 0; i < countries.length; i += batchSize) {
      const batch = countries.slice(i, i + batchSize);
      const values = batch.map((c) => {
        const eventData: Record<string, any> = {};
        for (const e of KINCH_EVENTS) {
          const slot = c.events[e.id];
          const wh = slot.world.holder;
          eventData[e.id] = {
            sw: Number(slot.world.score.toFixed(2)),
            vw: slot.world.value,
            kw: slot.world.kind,
            sc: Number(slot.cont.score.toFixed(2)),
            vc: slot.cont.value,
            kc: slot.cont.kind,
            h: wh
              ? {
                  i: wh.personId,
                  n: wh.personName,
                  c: wh.comp?.id ?? null,
                  cn: wh.comp?.name ?? null,
                  d: wh.comp?.date ?? null,
                  ct: wh.comp?.city ?? null,
                }
              : null,
          };
        }
        return [
          c.countryId,
          c.continentId,
          Number(c.kinchWorld.toFixed(4)),
          Number(c.kinchCont.toFixed(4)),
          JSON.stringify(eventData),
          c.rankWorld,
          c.rankCont,
          now,
        ];
      });
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
