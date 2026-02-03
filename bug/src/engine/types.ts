export type CompanyStatus = "active" | "bankrupt";

export interface Balance {
  cash: number;
  inventoryUnits: number;
  fixedAssetsNet: number;
  equity: number;
  debt: number;
  machines: number;
  workers: number;
}

export interface Company {
  id: string;
  name: string;
  balance: Balance;
  status: CompanyStatus;
}

export interface Decisions {
  // Commercial
  price: number;
  marketing: number;

  // Operations
  workers: number;
  productionTarget: number;

  // Capex
  machinesToBuy: number;

  // Finance
  loanDraw: number;   // new borrowing (>=0)
  loanRepay: number;  // voluntary repayment (>=0)
}

export interface PnL {
  revenue: number;
  cogs: number;
  payroll: number;
  marketing: number;
  fixedCosts: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  interest: number;
  taxes: number;
  profit: number;
}

export interface PeriodResult {
  period: number;
  mode: "annual" | "monthly";

  // Market & ops
  marketShare: number;
  demandAssigned: number;
  production: number;
  salesUnits: number;
  endInventoryUnits: number;

  // Financial statements
  pnl: PnL;
  cashEnd: number;
  equityEnd: number;
  debtEnd: number;
  machinesEnd: number;
  workersEnd: number;

  // Flags
  statusEnd: CompanyStatus;
}

export interface GameState {
  period: number;
  companies: Company[];
  lastDecisions: Record<string, Decisions>;
  history: Record<string, PeriodResult[]>;
}
