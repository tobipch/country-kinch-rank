# Country Kinch Ranks

Kinch ranks for countries (national records) using a WCA database on Hostpoint.
Mobile-first Next.js app with filters by continent and gender.

## What is a Kinch rank?

For each of 17 events, the score is `REF / NR × 100`, where NR is the
national record and REF is the world record (all-continents view) or the
continental record (when a continent is selected):

- **Averages**: 3×3, 4×4, 5×5, 2×2, OH, Megaminx, Pyraminx, Square-1,
  Clock, Skewb, 6×6, 7×7
- **Singles**: 4BLD, 5BLD, Multi-BLD
- **Best of single or average** (chosen independently per view): 3BLD, FM

For Multi-BLD, results are decoded to `points + (3600 − seconds) / 3600`
and the ratio of decoded scores is used. The country's Kinch score is the
plain average of the 17 event scores (missing events count as 0).

## Verifying a calculation

`npm run explain -- Switzerland` (or the **Explain Country Kinch** workflow
in the Actions tab) prints the entire calculation for one country: every NR
with its holder, every WR/CR reference with its holder, each event score,
and the final sums for both views. The script shares the exact code path
with the nightly compute job (`src/lib/kinch.ts`), so what it prints is
what gets stored.

## Database expectations

This app reads from an existing WCA-style database with these tables:

- `persons (wca_id, sub_id, name, country_id)`
- `countries (id, continent_id)`
- `ranks_single (person_id, event_id, best, country_id, continent_id, …)`
- `ranks_average (person_id, event_id, best, country_id, continent_id, …)`

It only writes to its own `country_kinch_ranks` table. Country and continent
display names are resolved client-side (no `countries.name` / `continents`
table needed)._

## Setup

```bash
cp .env.example .env       # fill in MYSQL_PASSWORD
npm install
npm run init-db            # creates `country_kinch_ranks` once
npm run compute            # builds the precomputed table (re-run to refresh)
npm run dev                # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## Refresh schedule

`npm run compute` recomputes everything in a single transaction and is safe to
run on a cron (e.g. nightly). Typical run reads the `Persons`, `Countries`,
`Continents`, `RanksSingle`, `RanksAverage` tables and writes one row per
`(country, gender)`.

### GitHub Actions

A workflow at `.github/workflows/compute-ranks.yml` runs the compute job
nightly at 03:17 UTC and can also be triggered manually from the Actions tab.
Only one repository secret is required (Settings → Secrets and variables →
Actions):

- `MYSQL_PASSWORD`

Host, user, database and port are hardcoded in the workflow (they are not
sensitive). The job touches only its own `country_kinch_ranks` table — all
existing WCA tables are read-only.

The Hostpoint database must allow external MySQL connections from GitHub's
runner IP range (or "any IP"). Vercel itself does not run the compute job.

## Architecture / performance

The page is statically generated and revalidated in the background every
10 minutes (`revalidate = 600`), so requests are served from the CDN cache
with no database roundtrip. Both score sets (world-record and
continental-record based) are embedded in the page; the continent filter
switches between them entirely client-side.
