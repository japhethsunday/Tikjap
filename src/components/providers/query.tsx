"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Home, the sidebar and the settings pages all mount the same
            // handful of queries. At 15s a user bouncing between two pages
            // refetched every one of them on each visit, which is what made
            // navigation feel like loading rather than switching. Mutations
            // invalidate the keys they affect, so staleness here is bounded by
            // writes rather than by the clock.
            staleTime: 120_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}