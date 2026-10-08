// Builds src/data/places.json from the US Census Bureau 2024 Gazetteer files (public domain):
// every county and every active incorporated municipality, with its internal point.
// Usage: node scripts/build-places.mjs <dir containing 2024_Gaz_counties_national.txt and 2024_Gaz_place_national.txt>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const rows = (f) => readFileSync(join(dir, f), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split("\t").map((c) => c.trim()));

const out = [];
const seen = new Set();
for (const [st, , , name, , , , , lat, lon] of rows("2024_Gaz_counties_national.txt")) {
  const id = `${st.toLowerCase()}-${slug(name)}`;
  if (seen.has(id)) continue;
  seen.add(id);
  out.push([id, name, st, "c", +(+lat).toFixed(4), +(+lon).toFixed(4)]);
}
const SUFFIX = / (city and borough|consolidated government \(balance\)|metro government \(balance\)|unified government \(balance\)|urban county|city|town|township|village|borough|municipality|plantation|corporation|comunidad|zona urbana)$/i;
for (const [st, , , rawName, lsad, funcstat, , , , , lat, lon] of rows("2024_Gaz_place_national.txt")) {
  if (funcstat !== "A" || lsad === "57") continue; // active governments only, no CDPs
  const name = rawName.replace(SUFFIX, "");
  const id = `${st.toLowerCase()}-${slug(name)}`;
  if (seen.has(id)) continue;
  seen.add(id);
  out.push([id, name, st, "t", +(+lat).toFixed(4), +(+lon).toFixed(4)]);
}
writeFileSync("src/data/places.json", JSON.stringify(out));
console.log(`${out.length} places (${out.filter((p) => p[3] === "c").length} counties)`);
