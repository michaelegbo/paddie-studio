import type { StudioFlow } from "@paddie-studio/types";

const apiBase = import.meta.env.VITE_STUDIO_API_BASE_URL ?? "/api";

export async function fetchFlows(): Promise<StudioFlow[]> {
  const response = await fetch(`${apiBase}/flows`, { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch flows");
  }
  return response.json() as Promise<StudioFlow[]>;
}
