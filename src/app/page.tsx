import Filters from "@/components/Filters";
import RankingTable from "@/components/RankingTable";
import { fetchRankings, lastComputedAt, listContinents } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  gender?: string;
  continent?: string;
};

function normalizeGender(input: string | undefined): "all" | "m" | "f" {
  if (input === "m" || input === "f") return input;
  return "all";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const gender = normalizeGender(searchParams.gender);
  const continentId = searchParams.continent || null;

  const [continents, rows, computedAt] = await Promise.all([
    listContinents(),
    fetchRankings(gender, continentId),
    lastComputedAt(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:pt-12">
      <header className="mb-6 sm:mb-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Country Kinch Ranks
          </h1>
          {computedAt && (
            <span className="text-xs text-white/40">
              {computedAt.toLocaleDateString()}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-white/60">
          Average of national-record Kinch scores across 18 events. Tap a row
          to see per-event breakdown.
        </p>
      </header>

      <div className="mb-5">
        <Filters
          continents={continents}
          gender={gender}
          continentId={continentId}
        />
      </div>

      <RankingTable rows={rows} showContinentRank={!!continentId} />

      <footer className="mt-8 text-center text-xs text-white/40">
        Source: WCA database · Inspired by{" "}
        <a
          href="https://wca.cuber.pro/kinch/countries"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-white/70"
        >
          wca.cuber.pro
        </a>
      </footer>
    </main>
  );
}
