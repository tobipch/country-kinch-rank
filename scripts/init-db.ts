import "dotenv/config";
import { getPool } from "../src/lib/db";

/**
 * Creates the derived table. If it exists with an outdated schema (missing
 * the event_data column), it is dropped and recreated — the data is fully
 * derived and rebuilt by compute-ranks on every run. If the schema is
 * current the table is left untouched so a later compute failure still
 * leaves yesterday's data in place.
 */
const CREATE_TABLE = `
CREATE TABLE country_kinch_ranks (
  country_id         VARCHAR(50)  NOT NULL,
  continent_id       VARCHAR(50)  NOT NULL,
  kinch_score_world  DECIMAL(8,4) NOT NULL,
  kinch_score_cont   DECIMAL(8,4) NOT NULL,
  event_data         JSON         NOT NULL,
  rank_world         INT          NOT NULL,
  rank_continent     INT          NOT NULL,
  computed_at        DATETIME     NOT NULL,
  PRIMARY KEY (country_id),
  KEY idx_world     (kinch_score_world),
  KEY idx_continent (continent_id, kinch_score_cont)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

async function main() {
  const pool = getPool();

  const [tables] = (await pool.query(
    "SHOW TABLES LIKE 'country_kinch_ranks'",
  )) as [any[], any];

  if (tables.length > 0) {
    const [cols] = (await pool.query(
      "SHOW COLUMNS FROM country_kinch_ranks LIKE 'event_data'",
    )) as [any[], any];
    if (cols.length > 0) {
      console.log("country_kinch_ranks up to date");
      await pool.end();
      return;
    }
    console.log("schema outdated — recreating country_kinch_ranks");
    await pool.query("DROP TABLE country_kinch_ranks");
  }

  await pool.query(CREATE_TABLE);
  console.log("country_kinch_ranks created");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
