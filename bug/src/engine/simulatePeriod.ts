import { Company, Decisions, PeriodResult, PnL } from "./types";
import { config } from "../config/baseConfig";
import { allocateMarket } from "./market";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeWeights(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.map(w => w / sum);
}

const monthlyWeights = normalizeWeights([...config.monthlyDemandWeights]);

function computeCapacityUnitsPerYear(b: Company["balance"], d: Decisions): number {
  const capMachines = b.machines * config.capacityPerMachine;
  const capWorkers = Math.max(0, d.workers) * config.capacityPerWorker;
  return Math.min(capMachines, capWorkers);
}

function computeDepreciationAnnual(b: Company["balance"]): number {
  const gross = b.machines * config.machineCost;
  return gross / config.machineLifeYears;
}

function computePnL(args: {
  revenue: number;
  salesUnits: number;
  workers: number;
  marketing: number;
  fixedCosts: number;
  depreciation: number;
  interest: number;
}): PnL {
  const unitCost = config.unitMaterialCost + config.unitVariableCost;
  const cogs = args.salesUnits * unitCost;
  const payroll = args.workers * config.salaryPerWorkerAnnual;
  const marketing = args.marketing;
  const fixedCosts = args.fixedCosts;

  const ebitda = args.revenue - cogs - payroll - marketing - fixedCosts;
  const ebit = ebitda - args.depreciation;
  const preTax = ebit - args.interest;
  const taxes = preTax > 0 ? preTax * config.taxRate : 0;
  const profit = preTax - taxes;

  return {
    revenue: args.revenue,
    cogs,
    payroll,
    marketing,
    fixedCosts,
    ebitda,
    depreciation: args.depreciation,
    ebit,
    interest: args.interest,
    taxes,
    profit
  };
}

function applyBankFinance(company: Company, d: Decisions): { interestAnnual: number } {
  const b = company.balance;

  // Draw new debt (cash in) subject to leverage cap
  const maxDebt = Math.max(0, b.equity) * config.maxDebtMultipleOfEquity;
  const allowedDraw = Math.max(0, maxDebt - b.debt);
  const draw = clamp(Math.max(0, d.loanDraw), 0, allowedDraw);

  // Repay (cash out), cannot exceed debt or cash available
  const repay = clamp(Math.max(0, d.loanRepay), 0, Math.min(b.debt + draw, b.cash + draw));

  b.debt = b.debt + draw - repay;
  b.cash = b.cash + draw - repay;

  const interestAnnual = b.debt * config.interestRateAnnual;
  return { interestAnnual };
}

function applyInvestment(company: Company, d: Decisions): void {
  const b = company.balance;
  const buy = Math.max(0, Math.floor(d.machinesToBuy || 0));
  if (buy <= 0) return;

  const cost = buy * config.machineCost;
  if (b.cash < cost) return; // silently ignore if insufficient cash (UI warns)
  b.cash -= cost;
  b.machines += buy;
  b.fixedAssetsNet += cost; // start at cost, later reduced via depreciation
}

function stepSimulate(
  companies: Company[],
  decisions: Record<string, Decisions>,
  demandThisStep: number,
  fixedCostsThisStep: number,
  mode: "annual" | "monthly",
  period: number
): Record<string, { marketShare: number; demandAssigned: number; salesUnits: number; revenue: number; production: number; endInventoryUnits: number; pnl: PnL; cashEnd: number; equityEnd: number; debtEnd: number; machinesEnd: number; workersEnd: number; statusEnd: Company["status"]; }>
{
  const alloc = allocateMarket(companies, decisions);
  const out: Record<string, any> = {};

  alloc.forEach(({ company, share }) => {
    const b = company.balance;
    const d = decisions[company.id];

    if (company.status !== "active") {
      out[company.id] = {
        marketShare: 0,
        demandAssigned: 0,
        salesUnits: 0,
        revenue: 0,
        production: 0,
        endInventoryUnits: b.inventoryUnits,
        pnl: computePnL({ revenue: 0, salesUnits: 0, workers: 0, marketing: 0, fixedCosts: 0, depreciation: 0, interest: 0 }),
        cashEnd: b.cash,
        equityEnd: b.equity,
        debtEnd: b.debt,
        machinesEnd: b.machines,
        workersEnd: b.workers,
        statusEnd: company.status
      };
      return;
    }

    // Finance (loan draw/repay) and capex happen at the start of the step
    const { interestAnnual } = applyBankFinance(company, d);
    applyInvestment(company, d);

    // Operations
    b.workers = Math.max(0, Math.floor(d.workers));
    const capacityAnnual = computeCapacityUnitsPerYear(b, d);
    const capacityStep = mode === "annual" ? capacityAnnual : capacityAnnual / 12;

    const production = Math.min(Math.max(0, d.productionTarget), capacityStep);
    const available = b.inventoryUnits + production;

    const demandAssigned = share * demandThisStep;
    const salesUnits = Math.min(available, demandAssigned);
    const revenue = salesUnits * Math.max(0.01, d.price);

    // Depreciation and interest are pro-rated in monthly mode
    const depreciationAnnual = computeDepreciationAnnual(b);
    const depreciation = mode === "annual" ? depreciationAnnual : depreciationAnnual / 12;
    const interest = mode === "annual" ? interestAnnual : interestAnnual / 12;

    const pnl = computePnL({
      revenue,
      salesUnits,
      workers: b.workers,
      marketing: Math.max(0, d.marketing),
      fixedCosts: fixedCostsThisStep,
      depreciation,
      interest
    });

    // Cash update: cash changes by profit + non-cash (add back depreciation) minus inventory build cost is handled via COGS only on sold units.
    // To keep the model simple and consistent with your current engine: we use profit as cash driver (as before),
    // but we must also subtract capex and loan flows (already applied to cash), so here we only add profit.
    b.cash += pnl.profit;
    b.equity += pnl.profit;

    b.inventoryUnits = available - salesUnits;

    // Book depreciation: reduce fixed assets net
    b.fixedAssetsNet = Math.max(0, b.fixedAssetsNet - depreciation);

    // Bankruptcy check (simple, game rule)
    if (b.cash < 0 || b.equity <= 0) {
      company.status = "bankrupt";
    }

    out[company.id] = {
      marketShare: share,
      demandAssigned,
      salesUnits,
      revenue,
      production,
      endInventoryUnits: b.inventoryUnits,
      pnl,
      cashEnd: b.cash,
      equityEnd: b.equity,
      debtEnd: b.debt,
      machinesEnd: b.machines,
      workersEnd: b.workers,
      statusEnd: company.status
    };
  });

  return out;
}

export function simulatePeriod(
  companies: Company[],
  decisions: Record<string, Decisions>,
  period: number
): Record<string, PeriodResult> {
  const mode: "annual" | "monthly" = config.monthlyPeriods.includes(period as any) ? "monthly" : "annual";
  const results: Record<string, PeriodResult> = {};

  if (mode === "annual") {
    const step = stepSimulate(
      companies,
      decisions,
      config.annualDemand,
      config.fixedCostsAnnual,
      "annual",
      period
    );

    Object.keys(step).forEach(id => {
      const s = step[id];
      results[id] = {
        period,
        mode,
        marketShare: s.marketShare,
        demandAssigned: s.demandAssigned,
        production: s.production,
        salesUnits: s.salesUnits,
        endInventoryUnits: s.endInventoryUnits,
        pnl: s.pnl,
        cashEnd: s.cashEnd,
        equityEnd: s.equityEnd,
        debtEnd: s.debtEnd,
        machinesEnd: s.machinesEnd,
        workersEnd: s.workersEnd,
        statusEnd: s.statusEnd
      };
    });

    return results;
  }

  // Monthly mode: apply the SAME decisions across 12 months, with non-linear demand weights.
  const perCompanyAcc: Record<string, any> = {};
  companies.forEach(c => {
    perCompanyAcc[c.id] = {
      share: 0,
      demandAssigned: 0,
      production: 0,
      salesUnits: 0,
      revenue: 0,
      pnl: {
        revenue: 0, cogs: 0, payroll: 0, marketing: 0, fixedCosts: 0, ebitda: 0,
        depreciation: 0, ebit: 0, interest: 0, taxes: 0, profit: 0
      } as PnL
    };
  });

  for (let m = 0; m < 12; m++) {
    const demandThisMonth = config.annualDemand * monthlyWeights[m];
    const fixedThisMonth = config.fixedCostsAnnual / 12;

    const step = stepSimulate(companies, decisions, demandThisMonth, fixedThisMonth, "monthly", period);
    Object.keys(step).forEach(id => {
      const s = step[id];
      // Weighted average share across months
      perCompanyAcc[id].share += s.marketShare * monthlyWeights[m];
      perCompanyAcc[id].demandAssigned += s.demandAssigned;
      perCompanyAcc[id].production += s.production;
      perCompanyAcc[id].salesUnits += s.salesUnits;
      perCompanyAcc[id].revenue += s.revenue;

      const pnl = perCompanyAcc[id].pnl as PnL;
      pnl.revenue += s.pnl.revenue;
      pnl.cogs += s.pnl.cogs;
      pnl.payroll += s.pnl.payroll / 12; // payroll passed annual in computePnL; normalize to monthly aggregation
      pnl.marketing += s.pnl.marketing;
      pnl.fixedCosts += s.pnl.fixedCosts;
      pnl.ebitda += s.pnl.ebitda;
      pnl.depreciation += s.pnl.depreciation;
      pnl.ebit += s.pnl.ebit;
      pnl.interest += s.pnl.interest;
      pnl.taxes += s.pnl.taxes;
      pnl.profit += s.pnl.profit;
    });
  }

  companies.forEach(c => {
    const b = c.balance;
    const acc = perCompanyAcc[c.id];

    results[c.id] = {
      period,
      mode,
      marketShare: acc.share,
      demandAssigned: acc.demandAssigned,
      production: acc.production,
      salesUnits: acc.salesUnits,
      endInventoryUnits: b.inventoryUnits,
      pnl: acc.pnl as PnL,
      cashEnd: b.cash,
      equityEnd: b.equity,
      debtEnd: b.debt,
      machinesEnd: b.machines,
      workersEnd: b.workers,
      statusEnd: c.status
    };
  });

  return results;
}
