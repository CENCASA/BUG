import { Company, Decisions, PeriodResult } from "../engine/types";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export type AIProfile = "balanced" | "aggressive" | "conservative";

export function aiProfileForCompanyId(id: string): AIProfile {
  if (id === "ai1") return "balanced";
  if (id === "ai2") return "aggressive";
  return "conservative";
}

export function generateAIDecisions(params: {
  company: Company;
  profile: AIProfile;
  lastResult?: PeriodResult;
  marketAvgPrice: number;
}): Decisions {
  const { company, profile, lastResult, marketAvgPrice } = params;
  const b = company.balance;

  const basePrice = marketAvgPrice > 0 ? marketAvgPrice : 30;

  let price = basePrice;
  let marketingFrac = 0.06;
  let targetUtil = 0.85;

  if (profile === "aggressive") {
    price = basePrice * 0.92;
    marketingFrac = 0.10;
    targetUtil = 0.95;
  } else if (profile === "conservative") {
    price = basePrice * 1.08;
    marketingFrac = 0.045;
    targetUtil = 0.75;
  }

  if (lastResult) {
    // Simple adaptation: if losing money, protect cash
    if (lastResult.pnl.profit < 0) {
      price *= 1.03;
      marketingFrac *= 0.85;
      targetUtil *= 0.9;
    }
    // If low share, push marketing a bit
    if (lastResult.marketShare < 0.22) {
      marketingFrac *= 1.10;
    }
  }

  const marketing = Math.floor(clamp(b.cash * marketingFrac, 0, 120000));

  // Workers and production target
  const maxByMachines = b.machines * 1000;
  const desiredAnnualProduction = Math.floor(maxByMachines * targetUtil);
  const workers = Math.max(0, Math.ceil(desiredAnnualProduction / 300));

  const productionTarget = desiredAnnualProduction;

  // Capex: buy machines if high cash and high utilization
  const machinesToBuy = b.cash > 450000 && targetUtil > 0.9 ? 1 : 0;

  // Banking: use debt only if cash is tight but equity still healthy
  const loanDraw = b.cash < 80000 && b.equity > 150000 ? 50000 : 0;
  const loanRepay = b.cash > 250000 && b.debt > 0 ? Math.min(50000, b.debt) : 0;

  return {
    price: Math.round(price),
    marketing,
    workers,
    productionTarget,
    machinesToBuy,
    loanDraw,
    loanRepay
  };
}

export function estimateMarketAvgPrice(companies: Company[], decisions: Record<string, Decisions>): number {
  const active = companies.filter(c => c.status === "active");
  if (active.length === 0) return 30;
  return active.reduce((a, c) => a + decisions[c.id].price, 0) / active.length;
}
