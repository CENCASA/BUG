import { Company, Decisions } from "./types";
import { config } from "../config/baseConfig";

export interface MarketAllocation {
  company: Company;
  share: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Market allocation based on:
 *  - relative price attractiveness (existing model)
 *  - marketing attractiveness (new, smooth)
 *
 * attractiveness_i = exp(-k * (p/Pref - 1)) * (marketing + 1)^alpha
 */
export function allocateMarket(companies: Company[], decisions: Record<string, Decisions>): MarketAllocation[] {
  const active = companies.filter(c => c.status === "active");
  if (active.length === 0) return companies.map(c => ({ company: c, share: 0 }));

  const prices = active.map(c => Math.max(0.01, decisions[c.id].price));
  const pref = median(prices) || 1;

  const attrs = active.map(c => {
    const p = Math.max(0.01, decisions[c.id].price);
    const m = Math.max(0, decisions[c.id].marketing);
    const priceTerm = Math.exp(-config.priceSensitivity * ((p / pref) - 1));
    const mkTerm = Math.pow(m + 1, config.marketingAlpha);
    return priceTerm * mkTerm;
  });

  const sum = attrs.reduce((a, b) => a + b, 0) || 1;

  const shareById: Record<string, number> = {};
  active.forEach((c, i) => {
    shareById[c.id] = attrs[i] / sum;
  });

  return companies.map(c => ({
    company: c,
    share: c.status === "active" ? (shareById[c.id] ?? 0) : 0
  }));
}
