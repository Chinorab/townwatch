// Saves the published briefings (and the followed list) to .cache/backup before a refresh, so a
// bad run can be undone: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/backup-briefings.ts [--restore file]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { kvFromEnv } from "../src/lib/store";
import { followedPlaces, FOLLOWED_KEY } from "../src/pipeline/followed";

const kv = await kvFromEnv();
const restore = process.argv.indexOf("--restore");
if (restore > 0) {
  const saved = JSON.parse(readFileSync(process.argv[restore + 1], "utf8")) as Record<string, unknown>;
  for (const [key, value] of Object.entries(saved)) if (value !== null) await kv.set(key, value);
  console.log(`Restored ${Object.keys(saved).length} keys.`);
} else {
  const extra = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const DEMO = ["nc-edgecombe-county", "ga-columbia-county", "mi-ann-arbor"]; // src/lib/briefings.ts is server-only
  const ids = [...new Set([...DEMO, ...(await followedPlaces(kv)), ...extra])];
  const out: Record<string, unknown> = { [FOLLOWED_KEY]: await kv.get(FOLLOWED_KEY) };
  for (const id of ids) out[`briefing:${id}`] = await kv.get(`briefing:${id}`);
  mkdirSync(".cache/backup", { recursive: true });
  const file = `.cache/backup/briefings-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(out));
  console.log(`Saved ${Object.values(out).filter(Boolean).length} keys to ${file}`);
}
