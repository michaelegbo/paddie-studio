const apiBase = import.meta.env.VITE_STUDIO_API_BASE_URL ?? "/api";
export async function fetchFlows() {
    const response = await fetch(`${apiBase}/flows`, { credentials: "include" });
    if (!response.ok) {
        throw new Error("Failed to fetch flows");
    }
    return response.json();
}
