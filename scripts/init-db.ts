import "dotenv/config";
import { getPool } from "../src/lib/db";

/**
 * Derived tables. Rebuilt when the schema version is missing or outdated.
 * A successful compute leaves yesterday's data in place on failure (we only
 * recreate when init-db detects a mismatch, not on every run).
 */
const SCHEMA_VERSION = 3;

const CREATE_RANKS = `
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

const CREATE_REFS = `
CREATE TABLE country_kinch_refs (
  event_id    VARCHAR(20)  NOT NULL,
  scope_id    VARCHAR(50)  NOT NULL,
  kind        CHAR(1)      NOT NULL,
  value       INT          NOT NULL,
  country_id  VARCHAR(255) NOT NULL,
  person_id   VARCHAR(50)  NOT NULL,
  person_name VARCHAR(255) NOT NULL,
  comp_id     VARCHAR(50),
  comp_name   VARCHAR(255),
  comp_date   DATE,
  comp_city   VARCHAR(255),
  PRIMARY KEY (event_id, scope_id, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

const CREATE_META = `
CREATE TABLE country_kinch_meta (
  k VARCHAR(50)  NOT NULL PRIMARY KEY,
  v VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

async function tableExists(pool: any, name: string): Promise<boolean> {
  const [rows] = await pool.query(`SHOW TABLES LIKE ?`, [name]);
  return rows.length > 0;
}

async function getVersion(pool: any): Promise<number | null> {
  if (!(await tableExists(pool, "country_kinch_meta"))) return null;
  const [rows] = await pool.query(
    `SELECT v FROM country_kinch_meta WHERE k = 'schema_version'`,
  );
  if (rows.length === 0) return null;
  const n = parseInt(rows[0].v, 10);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const pool = getPool();
  const current = await getVersion(pool);

  if (current === SCHEMA_VERSION) {
    console.log(`country_kinch_* up to date (v${current})`);
    await pool.end();
    return;
  }

  console.log(`Schema mismatch (current=${current ?? "none"}, want=${SCHEMA_VERSION}) — recreating`);
  await pool.query("DROP TABLE IF EXISTS country_kinch_ranks");
  await pool.query("DROP TABLE IF EXISTS country_kinch_refs");
  await pool.query("DROP TABLE IF EXISTS country_kinch_meta");

  await pool.query(CREATE_RANKS);
  await pool.query(CREATE_REFS);
  await pool.query(CREATE_META);
  await pool.query(
    "INSERT INTO country_kinch_meta (k, v) VALUES ('schema_version', ?)",
    [String(SCHEMA_VERSION)],
  );

  console.log("country_kinch_* created");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
