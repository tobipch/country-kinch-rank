import KinchBoard from "@/components/KinchBoard";
import { fetchBoard, type BoardData } from "@/lib/queries";

/**
 * Statically generated and revalidated in the background every 10 minutes.
 * Requests are served from the CDN cache — no database roundtrip on the
 * request path. The continent filter is purely client-side.
 */
export const revalidate = 600;

export default async function HomePage() {
  let data: BoardData | null = null;
  let error: string | null = null;
  try {
    data = await fetchBoard();
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.error("[country-kinch] load failed:", msg);
    if (/doesn't exist|Unknown table|Unknown column/i.test(msg)) {
      error =
        "The rankings table is missing or outdated. Run the GitHub Actions compute workflow.";
    } else if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Handshake/i.test(msg)) {
      error =
        "Cannot reach the MySQL host. Check that external connections are allowed and MYSQL_HOST is correct.";
    } else if (/Access denied/i.test(msg)) {
      error = "MySQL credentials were rejected. Check MYSQL_USER / MYSQL_PASSWORD.";
    } else {
      error = msg;
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-3 pb-16 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-4 sm:mb-6">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-xl sm:text-3xl font-semibold tracking-tight">
            Country Kinch Ranks
          </h1>
          {data?.computedAt && (
            <span className="shrink-0 text-xs text-white/40">
              {new Date(data.computedAt).toLocaleDateString("en-CH")}
            </span>
          )}
        </div>
      </header>

      {error || !data ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm">
          <div className="font-semibold text-amber-300">
            Rankings not available
          </div>
          <p className="mt-1 text-white/70">{error}</p>
        </div>
      ) : (
        <KinchBoard rows={data.rows} continents={data.continents} />
      )}

      <footer className="mt-6 text-center text-xs text-white/40">
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
