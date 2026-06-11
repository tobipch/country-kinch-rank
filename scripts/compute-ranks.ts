import "dotenv/config";
import { getPool } from "../src/lib/db";
import { computeAll } from "../src/lib/kinch";
import { KINCH_EVENTS } from "../src/lib/events";

async function main() {
  const pool = getPool();

  console.log("Computing Kinch ranks…");
  const { countries } = await computeAll();
  console.log(`  ${countries.length} countries with at least one result`);

  console.log(`Writing ${countries.length} rows…`);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM country_kinch_ranks");
    const now = new Date();
    const batchSize = 200;
    for (let i = 0; i < countries.length; i += batchSize) {
      const batch = countries.slice(i, i + batchSize);
      const values = batch.map((c) => {
        const eventData: Record<
          string,
          { sw: number; vw: number; kw: string; sc: number; vc: number; kc: string }
        > = {};
        for (const e of KINCH_EVENTS) {
          const slot = c.events[e.id];
          eventData[e.id] = {
            sw: Number(slot.world.score.toFixed(4)),
            vw: slot.world.value,
            kw: slot.world.kind,
            sc: Number(slot.cont.score.toFixed(4)),
            vc: slot.cont.value,
            kc: slot.cont.kind,
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
