// Tavily client: search, extract, map. Every response's credit usage is added to `credits`
// so the "How this was made" panel can show what discovery and reading cost.
export interface SearchResult {
  url: string;
  title: string;
  content: string;
  score: number;
}
export interface ExtractResult {
  url: string;
  raw_content: string;
}

export interface TavilyApi {
  credits: number;
  search(query: string, opts?: { maxResults?: number; excludeDomains?: string[] }): Promise<SearchResult[]>;
  extract(urls: string[], opts?: { depth?: "basic" | "advanced" }): Promise<{ results: ExtractResult[]; failed: { url: string; error: string }[] }>;
  map(url: string, opts?: { instructions?: string; limit?: number; selectPaths?: string[] }): Promise<string[]>;
}

type Post = (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function tavilyPost(env: NodeJS.ProcessEnv = process.env): Post {
  const key = env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  return async (path, body) => {
    const r = await fetch(`https://api.tavily.com/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, include_usage: true }),
      signal: AbortSignal.timeout(90_000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error(`Tavily ${path} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  };
}

export class Tavily implements TavilyApi {
  credits = 0;
  constructor(private readonly post: Post) {}

  private count(j: Record<string, unknown>, fallback: number) {
    const usage = j.usage as { credits?: number } | undefined;
    this.credits += typeof usage?.credits === "number" ? usage.credits : fallback;
  }

  async search(query: string, opts: { maxResults?: number; excludeDomains?: string[] } = {}) {
    const j = await this.post("search", {
      query,
      search_depth: "basic",
      max_results: opts.maxResults ?? 10,
      country: "united states",
      ...(opts.excludeDomains?.length ? { exclude_domains: opts.excludeDomains } : {}),
    });
    this.count(j, 1);
    return (j.results as SearchResult[]) ?? [];
  }

  async extract(urls: string[], opts: { depth?: "basic" | "advanced" } = {}) {
    const j = await this.post("extract", { urls, extract_depth: opts.depth ?? "basic", format: "markdown" });
    this.count(j, Math.ceil(urls.length / 5));
    return {
      results: (j.results as ExtractResult[]) ?? [],
      failed: (j.failed_results as { url: string; error: string }[]) ?? [],
    };
  }

  async map(url: string, opts: { instructions?: string; limit?: number; selectPaths?: string[] } = {}) {
    const j = await this.post("map", {
      url,
      max_depth: 1,
      limit: opts.limit ?? 40,
      ...(opts.instructions ? { instructions: opts.instructions } : {}),
      ...(opts.selectPaths ? { select_paths: opts.selectPaths } : {}),
    });
    this.count(j, 1);
    return (j.results as string[]) ?? [];
  }
}
