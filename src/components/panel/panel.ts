import { PRICES } from "@/lib/prices";
import type { PanelTotals } from "@/lib/schemas";

const LABELS: Record<string, string> = {
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": "Nemotron 3 Nano 30B",
  "nvidia/Nemotron-3_5-Lightning": "Nemotron 3.5 Lightning",
  "nvidia/nemotron-3-super-120b-a12b": "Nemotron 3 Super 120B",
  "nvidia/Nemotron-3-Ultra-550b-a55b": "Nemotron 3 Ultra 550B",
};
const SIZE: Record<string, number> = {
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": 30,
  "nvidia/Nemotron-3_5-Lightning": 30,
  "nvidia/nemotron-3-super-120b-a12b": 120,
  "nvidia/Nemotron-3-Ultra-550b-a55b": 550,
};

export interface ModelLine {
  id: string;
  label: string;
  calls: number;
  input: number;
  output: number;
  reasoning: number;
  costUsd: number;
  share: number; // of total cost
}

export function panelView(t: PanelTotals): { models: ModelLine[]; pricesAreEstimates: boolean } {
  const models = Object.entries(t.tokensByModel)
    .map(([id, m]) => ({ id, label: LABELS[id] ?? id, calls: m.calls, input: m.input, output: m.output, reasoning: m.reasoning, costUsd: m.costUsd, share: t.costUsd ? m.costUsd / t.costUsd : 0 }))
    .sort((a, b) => (SIZE[a.id] ?? 999) - (SIZE[b.id] ?? 999));
  return { models, pricesAreEstimates: models.some((m) => PRICES[m.id]?.source !== "console") };
}
