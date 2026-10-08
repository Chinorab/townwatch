// Pre-deploy gate (constitution VIII): fail if a key-like string sits in tracked files or in
// the client bundle. Values from .env.local are also searched for verbatim, without printing them.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const SKIP = new Set(["node_modules", ".git", ".cache", ".specify", "test-results", "playwright-report"]);
const PATTERNS = [/tvly-[A-Za-z0-9_-]{16,}/, /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/];

const secrets = [];
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^(NEBIUS_API_KEY|TAVILY_API_KEY|UPSTASH_REDIS_REST_TOKEN|CRON_SECRET)=(.{12,})$/);
    if (m) secrets.push({ name: m[1], value: m[2].trim() });
  }
}

const hits = [];
function walk(dir, inBuild) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const rel = relative(root, p).replaceAll("\\", "/");
    if (!inBuild && (rel === ".env.local" || rel.startsWith(".env."))) continue;
    if (rel === ".next" && !inBuild) { walk(p, true); continue; }
    if (inBuild && rel.startsWith(".next/") && !rel.startsWith(".next/static") && statSync(p).isFile()) continue;
    const st = statSync(p);
    if (st.isDirectory()) { walk(p, inBuild); continue; }
    if (st.size > 5_000_000) continue;
    const text = readFileSync(p, "utf8");
    for (const re of PATTERNS) if (re.test(text)) hits.push(`${rel}: matches ${re.source.slice(0, 12)}...`);
    for (const s of secrets) if (text.includes(s.value)) hits.push(`${rel}: contains the value of ${s.name}`);
  }
}
walk(root, false);

if (hits.length) {
  console.error("Secret check FAILED:\n" + hits.map((h) => "  " + h).join("\n"));
  process.exit(1);
}
console.log(`Secret check passed (${secrets.length} env values and ${PATTERNS.length} patterns searched).`);
