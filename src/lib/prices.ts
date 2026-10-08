// Token Factory prices in USD per million tokens. The official price page needs a login
// (FRICTION_LOG.md, 2026-10-08), so these are third-party figures until read from the console.
// Reasoning tokens are billed inside completion tokens.
export interface Price {
  input: number;
  output: number;
  source: "estimate" | "console";
}

export const PRICES: Record<string, Price> = {
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": { input: 0.06, output: 0.24, source: "estimate" },
  // Lightning price unknown: priced like Nano until confirmed, flagged in the panel.
  "nvidia/Nemotron-3_5-Lightning": { input: 0.06, output: 0.24, source: "estimate" },
  "nvidia/nemotron-3-super-120b-a12b": { input: 0.3, output: 0.9, source: "estimate" },
  "nvidia/Nemotron-3-Ultra-550b-a55b": { input: 1.0, output: 3.0, source: "estimate" },
};

const FALLBACK_PRICE: Price = { input: 1.0, output: 3.0, source: "estimate" };

export function priceOf(model: string): Price {
  return PRICES[model] ?? FALLBACK_PRICE;
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceOf(model);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
