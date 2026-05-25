import "dotenv/config";
import { getPool } from "../src/lib/db";

const DDL = `
CREATE TABLE IF NOT EXISTS country_kinch_ranks (
  country_id      VARCHAR(50)  NOT NULL,
  continent_id    VARCHAR(50)  NOT NULL,
  gender          ENUM('all','m','f') NOT NULL,
  kinch_score     DECIMAL(8,4) NOT NULL,
  event_scores    JSON         NOT NULL,
  event_values    JSON         NOT NULL,
  rank_overall    INT          NOT NULL,
  rank_continent  INT          NOT NULL,
  computed_at     DATETIME     NOT NULL,
  PRIMARY KEY (country_id, gender),
  KEY idx_gender_score (gender, kinch_score DESC),
  KEY idx_continent (continent_id, gender)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function main() {
  const pool = getPool();
  await pool.query(DDL);
  console.log("country_kinch_ranks ready");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
