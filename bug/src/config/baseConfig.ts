export const config = {
  // Plant & capacity
  capacityPerMachine: 1000,      // units/year per machine
  capacityPerWorker: 300,        // units/year per worker (confirmed)
  machineCost: 50000,
  machineLifeYears: 10,

  // Unit economics
  unitMaterialCost: 8,
  unitVariableCost: 4,

  // Fixed operating costs (excluding payroll)
  fixedCostsAnnual: 210000,
  salaryPerWorkerAnnual: 30000,

  // Market
  annualDemand: 18000,
  priceSensitivity: 2,
  marketingAlpha: 0.5,

  // Finance
  interestRateAnnual: 0.06,
  taxRate: 0.25,
  maxDebtMultipleOfEquity: 2,

  // Game
  totalPeriods: 6,
  monthlyPeriods: [5, 6] as const,

  // Non-linear monthly demand curve for monthly-mode years.
  // Values are normalized to sum to 1.
  monthlyDemandWeights: [
    0.07, 0.075, 0.08, 0.085, 0.09, 0.095,
    0.095, 0.09, 0.085, 0.08, 0.075, 0.07
  ]
};
