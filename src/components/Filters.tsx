"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  continents: { id: string; name: string }[];
  continentId: string | null;
}

export default function Filters({ continents, continentId }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function setContinent(next: string | null) {
    const sp = new URLSearchParams(params.toString());
    if (!next) sp.delete("continent");
    else sp.set("continent", next);
    startTransition(() => {
      router.replace(`/?${sp.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setContinent(null)}
        className={[
          "rounded-full px-3.5 py-1.5 text-sm transition ring-1",
          continentId === null
            ? "bg-white text-neutral-900 ring-white"
            : "bg-white/5 text-white/70 ring-white/10 hover:text-white",
        ].join(" ")}
      >
        All continents
      </button>
      {continents.map((c) => {
        const active = c.id === continentId;
        return (
          <button
            key={c.id}
            onClick={() => setContinent(c.id)}
            className={[
              "rounded-full px-3.5 py-1.5 text-sm transition ring-1",
              active
                ? "bg-white text-neutral-900 ring-white"
                : "bg-white/5 text-white/70 ring-white/10 hover:text-white",
            ].join(" ")}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
