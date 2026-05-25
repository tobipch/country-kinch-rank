import "dotenv/config";
import { getPool } from "../src/lib/db";

/**
 * The table is purely derived from the WCA tables; recreating it is safe and
 * keeps the schema in sync when columns change.
 */
const CREATE_TABLE = `
CREATE TABLE country_kinch_ranks (
  country_id          VARCHAR(50)  NOT NULL,
  continent_id        VARCHAR(50)  NOT NULL,
  kinch_score_world   DECIMAL(8,4) NOT NULL,
  kinch_score_cont    DECIMAL(8,4) NOT NULL,
  event_scores_world  JSON         NOT NULL,
  event_scores_cont   JSON         NOT NULL,
  event_values        JSON         NOT NULL,
  rank_world          INT          NOT NULL,
  rank_continent      INT          NOT NULL,
  computed_at         DATETIME     NOT NULL,
  PRIMARY KEY (country_id),
  KEY idx_world     (kinch_score_world),
  KEY idx_continent (continent_id, kinch_score_cont)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

async function main() {
  const pool = getPool();
  await pool.query("DROP TABLE IF EXISTS country_kinch_ranks");
  await pool.query(CREATE_TABLE);
  console.log("country_kinch_ranks ready");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
