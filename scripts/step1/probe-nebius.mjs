// Step 1 probe: list the NVIDIA models served by Token Factory, then send one tiny
// request to each Nemotron tier to confirm access, latency and token accounting.
// Run: node --env-file=.env.local scripts/step1/probe-nebius.mjs
import { writeFileSync } from "node:fs";

const key = process.env.NEBIUS_API_KEY;
const base = (process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1/").replace(/\/?$/, "/");
if (!key) {
  console.error("NEBIUS_API_KEY is missing (expected in .env.local)");
  process.exit(1);
}
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const res = await fetch(base + "models", { headers });
if (!res.ok) {
  console.error(`GET /models failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const all = (await res.json()).data.map((m) => m.id).sort();
const nvidia = all.filter((id) => /nvidia|nemotron/i.test(id));
console.log(`Catalogue: ${all.length} models, ${nvidia.length} NVIDIA:`);
for (const id of nvidia) console.log("  " + id);

// One short call per tier. The prompt mimics the real triage task at toy size.
const prompt =
  'Agenda item: "Approve a $48,500 contract with Smith Paving for resurfacing Old Mill Road." ' +
  'Reply with JSON only: {"topic": one of [roads, taxes, schools, zoning, water, other], "decision": true|false}';

const tiers = [
  { tier: "nano", match: /nano-30b/i, thinkingOff: true },
  { tier: "lightning", match: /lightning/i, thinkingOff: true },
  { tier: "super", match: /super/i, thinkingOff: true },
  { tier: "ultra", match: /ultra/i, thinkingOff: false },
];

const report = { date: new Date().toISOString(), catalogue: all, nvidia, calls: [] };
for (const t of tiers) {
  const model = nvidia.find((id) => t.match.test(id));
  if (!model) {
    console.log(`\n[${t.tier}] not in catalogue`);
    report.calls.push({ tier: t.tier, model: null });
    continue;
  }
  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: t.thinkingOff ? 60 : 800,
    temperature: 0,
    ...(t.thinkingOff ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  };
  const t0 = Date.now();
  try {
    const r = await fetch(base + "chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    const ms = Date.now() - t0;
    const j = await r.json();
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    const msg = j.choices[0].message;
    const out = {
      tier: t.tier,
      model,
      ms,
      usage: j.usage,
      content: (msg.content ?? "").trim().slice(0, 200),
      hasReasoningField: Boolean(msg.reasoning || msg.reasoning_content),
    };
    report.calls.push(out);
    console.log(`\n[${t.tier}] ${model} ${ms} ms`, JSON.stringify(j.usage));
    console.log("  content:", out.content);
  } catch (e) {
    report.calls.push({ tier: t.tier, model, error: String(e) });
    console.log(`\n[${t.tier}] ${model} ERROR ${e}`);
  }
}
writeFileSync("research/step1/nebius-probe.json", JSON.stringify(report, null, 2));
console.log("\nSaved research/step1/nebius-probe.json");
