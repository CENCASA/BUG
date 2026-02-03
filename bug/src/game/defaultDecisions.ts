import { Decisions } from "../engine/types";

export function defaultPlayerDecisions(): Decisions {
  return {
    price: 30,
    marketing: 40000,
    workers: 12,
    productionTarget: 5000,
    machinesToBuy: 0,
    loanDraw: 0,
    loanRepay: 0
  };
}
