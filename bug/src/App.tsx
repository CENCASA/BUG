import { useMemo, useState } from "react";
import { config } from "./config/baseConfig";
import { simulatePeriod } from "./engine/simulatePeriod";
import { Company, Decisions, GameState, PeriodResult } from "./engine/types";
import { createInitialGameState } from "./game/createInitialGameState";
import { defaultPlayerDecisions } from "./game/defaultDecisions";
import { aiProfileForCompanyId, generateAIDecisions } from "./game/ai";
import { fmtInt, fmtMoney, fmtPct } from "./ui/format";
import { Sparkline } from "./ui/Sparkline";

function deepCloneCompanies(companies: Company[]): Company[] {
  return companies.map(c => ({
    ...c,
    balance: { ...c.balance }
  }));
}

function initState(): GameState {
  const companies = createInitialGameState();
  const playerDefault = defaultPlayerDecisions();
  const lastDecisions: Record<string, Decisions> = {};
  companies.forEach(c => {
    lastDecisions[c.id] = c.id === "player" ? playerDefault : {
      price: 30, marketing: 35000, workers: 10, productionTarget: 5000, machinesToBuy: 0, loanDraw: 0, loanRepay: 0
    };
  });

  const history: Record<string, PeriodResult[]> = {};
  companies.forEach(c => (history[c.id] = []));

  return {
    period: 1,
    companies,
    lastDecisions,
    history
  };
}

function computeMarketAvgPrice(decisions: Record<string, Decisions>, companies: Company[]) {
  const active = companies.filter(c => c.status === "active");
  if (active.length === 0) return 30;
  return active.reduce((a, c) => a + decisions[c.id].price, 0) / active.length;
}

function kpiDeltaText(prev?: number, next?: number) {
  if (prev === undefined || next === undefined) return "";
  const d = next - prev;
  if (Math.abs(d) < 1e-6) return "≈ 0";
  const sign = d > 0 ? "+" : "";
  return `${sign}${fmtMoney(d)}`;
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => initState());
  const [playerDecisions, setPlayerDecisions] = useState<Decisions>(() => ({ ...game.lastDecisions["player"] }));

  const period = game.period;
  const mode = config.monthlyPeriods.includes(period as any) ? "Mensual (12 pasos)" : "Anual";
  const isFinished = period > config.totalPeriods;

  const playerCompany = game.companies.find(c => c.id === "player")!;
  const lastPlayerResult = game.history["player"][game.history["player"].length - 1];

  const equitySeries = game.history["player"].map(r => r.equityEnd);
  const cashSeries = game.history["player"].map(r => r.cashEnd);

  const ranking = useMemo(() => {
    const rows = game.companies.map(c => {
      const hist = game.history[c.id];
      const last = hist[hist.length - 1];
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        equity: c.balance.equity,
        cash: c.balance.cash,
        cumProfit: hist.reduce((a, r) => a + r.pnl.profit, 0),
        last
      };
    });

    rows.sort((a, b) => {
      if (b.equity !== a.equity) return b.equity - a.equity;
      if (b.cash !== a.cash) return b.cash - a.cash;
      return b.cumProfit - a.cumProfit;
    });

    return rows;
  }, [game]);

  function reset() {
    const next = initState();
    setGame(next);
    setPlayerDecisions({ ...next.lastDecisions["player"] });
  }

  function run() {
    if (isFinished) return;

    const companies = deepCloneCompanies(game.companies);

    // Build decisions for all companies
    const decisions: Record<string, Decisions> = {};
    companies.forEach(c => {
      if (c.id === "player") {
        decisions[c.id] = { ...playerDecisions };
        return;
      }

      const profile = aiProfileForCompanyId(c.id);
      const last = game.history[c.id][game.history[c.id].length - 1];
      const marketAvg = computeMarketAvgPrice(game.lastDecisions, game.companies);

      decisions[c.id] = generateAIDecisions({
        company: c,
        profile,
        lastResult: last,
        marketAvgPrice: marketAvg
      });
    });

    // Persist last decisions
    const nextLastDecisions = { ...game.lastDecisions, ...decisions };

    // Simulate
    const results = simulatePeriod(companies, decisions, period);

    // Update history
    const nextHistory: Record<string, PeriodResult[]> = {};
    companies.forEach(c => {
      nextHistory[c.id] = [...(game.history[c.id] ?? []), results[c.id]];
    });

    const next: GameState = {
      period: period + 1,
      companies,
      lastDecisions: nextLastDecisions,
      history: nextHistory
    };

    setGame(next);
  }

  const capacityByMachines = playerCompany.balance.machines * config.capacityPerMachine;
  const capacityByWorkers = playerDecisions.workers * config.capacityPerWorker;
  const effectiveAnnualCapacity = Math.min(capacityByMachines, capacityByWorkers);

  const debtCap = playerCompany.balance.equity * config.maxDebtMultipleOfEquity;
  const remainingDebtRoom = Math.max(0, debtCap - playerCompany.balance.debt);

  const capexCost = Math.max(0, Math.floor(playerDecisions.machinesToBuy)) * config.machineCost;
  const willAffordCapex = playerCompany.balance.cash + Math.max(0, playerDecisions.loanDraw) - Math.max(0, playerDecisions.loanRepay) >= capexCost;

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <div className="logo" />
          <div className="title">
            <h1>Business Game Industrial</h1>
            <p>6 periodos · Balance y PyG abreviados · Mercado competitivo</p>
          </div>
        </div>

        <div className="top-actions">
          <span className="pill">
            <strong>Periodo</strong>&nbsp;{Math.min(period, config.totalPeriods)} / {config.totalPeriods}
          </span>
          <span className="pill">
            <strong>Modo</strong>&nbsp;{mode}
          </span>
          <button className="btn" onClick={reset}>Reiniciar</button>
          <button className="btn primary" onClick={run} disabled={isFinished || playerCompany.status !== "active"}>
            {isFinished ? "Partida finalizada" : "Ejecutar periodo"}
          </button>
        </div>
      </div>

      <div className="grid">
        {/* LEFT: Player cockpit */}
        <div className="card">
          <div className="card-h">
            <h2>Cabina del jugador</h2>
            <span className={playerCompany.status === "active" ? "badge good" : "badge bad"}>
              {playerCompany.status === "active" ? "Operativa" : "En quiebra"}
            </span>
          </div>
          <div className="card-b">
            <div className="kpis">
              <div className="kpi">
                <div className="label">Caja</div>
                <div className="value">{fmtMoney(playerCompany.balance.cash)}</div>
                <div className={"delta " + ((lastPlayerResult && lastPlayerResult.cashEnd - (game.history["player"].length >= 2 ? game.history["player"][game.history["player"].length - 2].cashEnd : playerCompany.balance.cash) >= 0) ? "good" : "bad")}>
                  {game.history["player"].length >= 2
                    ? kpiDeltaText(game.history["player"][game.history["player"].length - 2].cashEnd, lastPlayerResult?.cashEnd)
                    : "—"}
                </div>
              </div>
              <div className="kpi">
                <div className="label">Patrimonio neto</div>
                <div className="value">{fmtMoney(playerCompany.balance.equity)}</div>
                <div className="delta">{equitySeries.length ? `Histórico · ${equitySeries.length} periodos` : "—"}</div>
              </div>
              <div className="kpi">
                <div className="label">Stock (unid.)</div>
                <div className="value">{fmtInt(playerCompany.balance.inventoryUnits)}</div>
                <div className="delta">Valorado a coste en Balance</div>
              </div>
              <div className="kpi">
                <div className="label">Deuda</div>
                <div className="value">{fmtMoney(playerCompany.balance.debt)}</div>
                <div className="delta">Límite: {fmtMoney(debtCap)}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <div className="kpi">
                <div className="label">Equity (sparkline)</div>
                <Sparkline values={equitySeries.length ? equitySeries : [playerCompany.balance.equity, playerCompany.balance.equity]} />
              </div>
              <div className="kpi">
                <div className="label">Caja (sparkline)</div>
                <Sparkline values={cashSeries.length ? cashSeries : [playerCompany.balance.cash, playerCompany.balance.cash]} />
              </div>
            </div>

            <div style={{ marginTop: 14 }} className="form">
              <div className="field">
                <label>Precio (€/ud)</label>
                <input
                  type="number"
                  min={1}
                  value={playerDecisions.price}
                  onChange={e => setPlayerDecisions(p => ({ ...p, price: +e.target.value }))}
                />
              </div>

              <div className="field">
                <label>Marketing (€/año)</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={playerDecisions.marketing}
                  onChange={e => setPlayerDecisions(p => ({ ...p, marketing: +e.target.value }))}
                />
              </div>

              <div className="field">
                <label>Trabajadores</label>
                <input
                  type="number"
                  min={0}
                  value={playerDecisions.workers}
                  onChange={e => setPlayerDecisions(p => ({ ...p, workers: +e.target.value }))}
                />
              </div>

              <div className="field">
                <label>Producción objetivo (ud/año)</label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={playerDecisions.productionTarget}
                  onChange={e => setPlayerDecisions(p => ({ ...p, productionTarget: +e.target.value }))}
                />
              </div>

              <div className="field">
                <label>Comprar máquinas (nº)</label>
                <input
                  type="number"
                  min={0}
                  value={playerDecisions.machinesToBuy}
                  onChange={e => setPlayerDecisions(p => ({ ...p, machinesToBuy: +e.target.value }))}
                />
              </div>

              <div className="field">
                <label>Crédito (disponer) (€)</label>
                <input
                  type="number"
                  min={0}
                  step={10000}
                  value={playerDecisions.loanDraw}
                  onChange={e => setPlayerDecisions(p => ({ ...p, loanDraw: +e.target.value }))}
                />
              </div>

              <div className="field">
                <label>Amortizar deuda (€/año)</label>
                <input
                  type="number"
                  min={0}
                  step={10000}
                  value={playerDecisions.loanRepay}
                  onChange={e => setPlayerDecisions(p => ({ ...p, loanRepay: +e.target.value }))}
                />
              </div>

              <div className="field">
                <label>Capacidad efectiva (ud/año)</label>
                <input
                  readOnly
                  value={fmtInt(effectiveAnnualCapacity)}
                />
              </div>
            </div>

            <div className="hint">
              <div>Capacidad por máquinas: <strong>{fmtInt(capacityByMachines)}</strong> ud/año · por trabajadores: <strong>{fmtInt(capacityByWorkers)}</strong> ud/año.</div>
              <div>Margen de deuda disponible: <strong>{fmtMoney(remainingDebtRoom)}</strong>.</div>
              {!willAffordCapex && capexCost > 0 && (
                <div style={{ marginTop: 6, color: "var(--warn)" }}>
                  Aviso: la compra de máquinas supera tu caja disponible (tras crédito/amortización). Se ignorará si no hay fondos.
                </div>
              )}
            </div>

            {lastPlayerResult && (
              <>
                <div style={{ marginTop: 18 }} className="card">
                  <div className="card-h">
                    <h2>Estados financieros · Último periodo</h2>
                    <span className={lastPlayerResult.pnl.profit >= 0 ? "badge good" : "badge bad"}>
                      Resultado: {fmtMoney(lastPlayerResult.pnl.profit)}
                    </span>
                  </div>
                  <div className="card-b">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>PyG abreviada</th>
                          <th>€</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr><td>Ingresos</td><td>{fmtMoney(lastPlayerResult.pnl.revenue)}</td></tr>
                        <tr className="row-muted"><td>Coste de ventas</td><td>-{fmtMoney(lastPlayerResult.pnl.cogs)}</td></tr>
                        <tr className="row-muted"><td>Gastos de personal</td><td>-{fmtMoney(lastPlayerResult.pnl.payroll)}</td></tr>
                        <tr className="row-muted"><td>Marketing</td><td>-{fmtMoney(lastPlayerResult.pnl.marketing)}</td></tr>
                        <tr className="row-muted"><td>Otros gastos fijos</td><td>-{fmtMoney(lastPlayerResult.pnl.fixedCosts)}</td></tr>
                        <tr><td><strong>EBITDA</strong></td><td><strong>{fmtMoney(lastPlayerResult.pnl.ebitda)}</strong></td></tr>
                        <tr className="row-muted"><td>Amortización</td><td>-{fmtMoney(lastPlayerResult.pnl.depreciation)}</td></tr>
                        <tr><td>EBIT</td><td>{fmtMoney(lastPlayerResult.pnl.ebit)}</td></tr>
                        <tr className="row-muted"><td>Gastos financieros</td><td>-{fmtMoney(lastPlayerResult.pnl.interest)}</td></tr>
                        <tr className="row-muted"><td>Impuesto</td><td>-{fmtMoney(lastPlayerResult.pnl.taxes)}</td></tr>
                        <tr><td><strong>Beneficio</strong></td><td><strong>{fmtMoney(lastPlayerResult.pnl.profit)}</strong></td></tr>
                      </tbody>
                    </table>

                    <div style={{ height: 10 }} />

                    <table className="table">
                      <thead>
                        <tr>
                          <th>Balance abreviado</th>
                          <th>€ / unidades</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr><td>Caja</td><td>{fmtMoney(playerCompany.balance.cash)}</td></tr>
                        <tr><td>Existencias (ud.)</td><td>{fmtInt(playerCompany.balance.inventoryUnits)}</td></tr>
                        <tr><td>Inmovilizado neto</td><td>{fmtMoney(playerCompany.balance.fixedAssetsNet)}</td></tr>
                        <tr><td>Deuda</td><td>{fmtMoney(playerCompany.balance.debt)}</td></tr>
                        <tr><td><strong>Patrimonio neto</strong></td><td><strong>{fmtMoney(playerCompany.balance.equity)}</strong></td></tr>
                      </tbody>
                    </table>

                    <div className="footer-note">
                      En periodos 5 y 6, la simulación es mensual (12 pasos) usando la misma decisión anual.
                      La demanda anual se reparte con una curva no lineal (estacionalidad).
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* RIGHT: Market + competitors */}
        <div className="card">
          <div className="card-h">
            <h2>Mercado y ranking</h2>
            <span className="badge">Criterio: Equity &gt; Caja &gt; Beneficio acumulado</span>
          </div>
          <div className="card-b">
            <table className="table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Estado</th>
                  <th>Cuota</th>
                  <th>Ventas (ud.)</th>
                  <th>Caja</th>
                  <th>Equity</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, idx) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{idx + 1}. {r.name}</strong>
                    </td>
                    <td>
                      <span className={r.status === "active" ? "badge good" : "badge bad"}>
                        {r.status === "active" ? "Activa" : "Quiebra"}
                      </span>
                    </td>
                    <td>{r.last ? fmtPct(r.last.marketShare) : "—"}</td>
                    <td>{r.last ? fmtInt(r.last.salesUnits) : "—"}</td>
                    <td>{fmtMoney(r.cash)}</td>
                    <td>{fmtMoney(r.equity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ height: 14 }} />

            <div className="kpis" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              <div className="kpi">
                <div className="label">Demanda anual</div>
                <div className="value">{fmtInt(config.annualDemand)} ud</div>
                <div className="delta">En modo mensual se distribuye no linealmente</div>
              </div>
              <div className="kpi">
                <div className="label">Coste fijo anual (sin nóminas)</div>
                <div className="value">{fmtMoney(config.fixedCostsAnnual)}</div>
                <div className="delta">Nóminas: {fmtMoney(config.salaryPerWorkerAnnual)} / trabajador</div>
              </div>
            </div>

            <div className="hint" style={{ marginTop: 12 }}>
              <div><strong>Qué decide el jugador:</strong> precio, marketing, trabajadores, producción objetivo, máquinas a comprar, crédito (disponer/amortizar).</div>
              <div><strong>Qué gana:</strong> mayor patrimonio neto al final del periodo 6, con riesgo real de quiebra (caja &lt; 0 o equity ≤ 0).</div>
            </div>

            {isFinished && (
              <div style={{ marginTop: 12, color: "var(--good)" }}>
                Partida finalizada. Ranking consolidado en el periodo {config.totalPeriods}.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
