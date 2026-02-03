import { Company } from "../engine/types";
import { config } from "../config/baseConfig";

export function createInitialGameState(): Company[] {
  const capital = 350000;
  const machines = 5;

  return ["Jugador", "Competidor A", "Competidor B", "Competidor C"].map((name, i) => ({
    id: i === 0 ? "player" : "ai" + i,
    name,
    status: "active",
    balance: {
      cash: capital - machines * config.machineCost,
      inventoryUnits: 0,
      fixedAssetsNet: machines * config.machineCost,
      equity: capital,
      debt: 0,
      machines,
      workers: 10
    }
  }));
}
