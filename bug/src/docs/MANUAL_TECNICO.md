# Manual técnico — Business Game Industrial (v1.1)

## 1. Visión general
Juego de simulación empresarial industrial con competencia en un mercado único. Cada periodo (1–6) el jugador toma decisiones comerciales, operativas, de inversión y de financiación. El motor convierte decisiones en ventas, cuenta de resultados y balance abreviados.

- Periodos 1–4: simulación anual (un único paso).
- Periodos 5–6: simulación mensual (12 pasos internos) aplicando la misma decisión anual. La demanda anual se reparte con una curva no lineal (estacionalidad).

## 2. Entidades y estructuras de datos

### 2.1. Balance (abreviado)
Variables de estado por empresa:

- `cash` (Caja)
- `inventoryUnits` (Existencias en unidades)
- `fixedAssetsNet` (Inmovilizado neto)
- `equity` (Patrimonio neto)
- `debt` (Deuda)
- `machines` (Máquinas instaladas)
- `workers` (Trabajadores)

Estado adicional:
- `status`: `active` | `bankrupt`

### 2.2. Decisiones por periodo
- `price` (precio €/ud)
- `marketing` (gasto de marketing)
- `workers` (plantilla)
- `productionTarget` (producción objetivo)
- `machinesToBuy` (nº de máquinas a comprar)
- `loanDraw` (crédito: disposición)
- `loanRepay` (crédito: amortización voluntaria)

## 3. Motor de mercado

### 3.1. Cuota de mercado
Para empresas activas, se calcula una atractividad:

A_i = exp(-k * (P_i / P_ref - 1)) * (M_i + 1)^α

- k = `priceSensitivity`
- α = `marketingAlpha`
- P_ref: mediana de precios del periodo (robusta a extremos)

Cuota:
share_i = A_i / ΣA

### 3.2. Demanda
Demanda anual base: `annualDemand`.

- En modo anual: demanda del paso = `annualDemand`.
- En modo mensual: demanda del mes m = `annualDemand * w_m`, con pesos `w_m` normalizados (suman 1).

## 4. Operaciones

### 4.1. Capacidad efectiva
Dos cuellos de botella:

- Capacidad por máquinas: `machines * capacityPerMachine`
- Capacidad por trabajadores: `workers * capacityPerWorker` (confirmado: 300 u/año por trabajador)

Capacidad anual efectiva:
cap = min(cap_machines, cap_workers)

Producción del paso:
- anual: `production = min(productionTarget, cap)`
- mensual: `production = min(productionTarget, cap/12)`

### 4.2. Ventas e inventario
Disponible = inventario inicial + producción del paso  
Ventas = min(disponible, demanda_asignada)  
Inventario final = disponible - ventas

## 5. Estados financieros

### 5.1. PyG abreviada (modelo operativo)
Coste unitario:
unitCost = unitMaterialCost + unitVariableCost

- Ingresos: revenue = ventas * precio
- Coste de ventas (COGS): cogs = ventas * unitCost
- Nóminas: payroll = workers * salaryPerWorkerAnnual
- Marketing: marketing = decision.marketing
- Otros fijos: fixedCosts = fixedCostsAnnual (o /12 en mensual)
- EBITDA = revenue - cogs - payroll - marketing - fixedCosts
- Amortización = (machines * machineCost) / machineLifeYears (o /12 en mensual)
- EBIT = EBITDA - amortización
- Intereses = debt * interestRateAnnual (o /12 en mensual)
- Resultado antes de impuestos = EBIT - intereses
- Impuesto (solo si > 0): taxRate
- Beneficio = preTax - taxes

### 5.2. Caja y patrimonio neto
Simplificación consciente (didáctica): el motor actualiza caja y equity por beneficio del paso:

cash += profit  
equity += profit

Además, al inicio del paso:
- Entrada/salida por deuda (loanDraw/loanRepay) impacta caja y deuda
- Compra de máquinas impacta caja, máquinas e inmovilizado

**Nota**: este modelo (como el original del proyecto) no capitaliza inventario en caja separadamente; el efecto caja se aproxima por beneficio.

### 5.3. Balance abreviado
- Caja: `cash`
- Existencias: `inventoryUnits` (unidades; valoración a coste se calcula externamente si se desea mostrar)
- Inmovilizado neto: `fixedAssetsNet` (se reduce por amortización)
- Deuda: `debt`
- Patrimonio neto: `equity`

## 6. Crédito bancario (reglas)
- Límite de deuda: `maxDebtMultipleOfEquity * equity`
- Disposición: `loanDraw` se recorta a lo permitido por límite.
- Amortización voluntaria: `loanRepay` no puede superar deuda ni caja disponible.
- Intereses: aplican sobre deuda tras movimientos del inicio del paso.

## 7. Quiebra (regla de juego)
Si al final del paso:
- cash < 0 **o**
- equity ≤ 0  
⇒ status = `bankrupt` (empresa deja de competir en mercado; cuota 0).

## 8. IA de competidores
Reglas deterministas por perfil:
- Balanced, Aggressive, Conservative.
Ajustan precio y marketing en torno a la referencia de mercado y reaccionan a:
- beneficios negativos (recorte/defensa)
- cuota baja (impulso marketing)

## 9. Condiciones de victoria (ranking)
Ranking final (y durante partida):
1) mayor equity
2) desempate por mayor caja
3) desempate por mayor beneficio acumulado

## 10. Parámetros editables
Ver `src/config/baseConfig.ts`:
- demanda, sensibilidad al precio, peso de marketing
- costes unitarios, costes fijos, salarios
- intereses, impuestos, límite de deuda
- pesos mensuales de demanda (no linealidad intra-año)

---
Fin.
