export type Role = 'server' | 'bartender' | 'runner' | 'host' | 'kitchen';

// ─── Tip-out rules ────────────────────────────────────────────────────────────

export interface TipOutRule {
  role: string;              // receiving role (e.g. 'bartender', 'runner')
  percentage: number;        // % of server's total sales
  distribution: 'direct' | 'house_pool';
}

export interface TipOutBreakdownItem {
  role: string;
  percentage: number;
  amount: number; // CAD cents
}

export interface ServerTipOutResult {
  directTipOuts: TipOutBreakdownItem[]; // goes directly to a role
  housePoolContribution: number;        // CAD cents going to house pool
  totalTipOut: number;                  // CAD cents tipped out (direct + house pool)
  tipsKept: number;                     // serverTips − totalTipOut (may be negative)
}

/**
 * Calculate how much a server tips out from their shift sales.
 *
 * @param serverSales  Server's total sales in CAD cents.
 * @param serverTips   Server's total tips earned in CAD cents.
 * @param tipOutRules  Rules defining who gets tipped out and at what % of sales.
 */
export function calculateServerTipOut(
  serverSales: number,
  serverTips: number,
  tipOutRules: TipOutRule[],
): ServerTipOutResult {
  const directTipOuts: TipOutBreakdownItem[] = [];
  let housePoolContribution = 0;

  for (const rule of tipOutRules) {
    const amount = Math.round(serverSales * (rule.percentage / 100));
    if (rule.distribution === 'direct') {
      directTipOuts.push({ role: rule.role, percentage: rule.percentage, amount });
    } else {
      housePoolContribution += amount;
    }
  }

  const totalTipOut =
    directTipOuts.reduce((sum, t) => sum + t.amount, 0) + housePoolContribution;
  const tipsKept = serverTips - totalTipOut;

  return { directTipOuts, housePoolContribution, totalTipOut, tipsKept };
}

// ─── House pool ───────────────────────────────────────────────────────────────

export interface HousePoolStaff {
  staffId: string;
  name: string;
  distribution_type: 'fixed' | 'points';
  fixed_amount?: number;    // CAD cents — used when distribution_type === 'fixed'
  points_per_hour?: number; // used when distribution_type === 'points'
  hours_worked: number;
}

export interface HousePoolAllocation {
  staffId: string;
  name: string;
  distributionType: 'fixed' | 'points';
  hoursWorked: number;
  points: number; // 0 for fixed-amount staff
  calculatedAmount: number; // CAD cents
}

/**
 * Distribute the house tip pool to support staff.
 *
 * Fixed-amount staff are paid first; the remaining balance is distributed by
 * points (hours × points_per_hour). Largest-fraction tie-breaking ensures
 * exact cent distribution with no rounding loss.
 *
 * @param poolBalance    Total cents available in the house pool.
 * @param housePoolRoles Staff eligible to receive from the pool.
 */
export function calculateHousePool(
  poolBalance: number,
  housePoolRoles: HousePoolStaff[],
): HousePoolAllocation[] {
  const fixedStaff = housePoolRoles.filter((s) => s.distribution_type === 'fixed');
  const pointsStaff = housePoolRoles.filter((s) => s.distribution_type === 'points');

  const allocations: HousePoolAllocation[] = [];
  let remaining = poolBalance;

  // 1. Pay fixed amounts first
  for (const s of fixedStaff) {
    const amount = Math.min(s.fixed_amount ?? 0, remaining);
    remaining = Math.max(0, remaining - amount);
    allocations.push({
      staffId: s.staffId,
      name: s.name,
      distributionType: 'fixed',
      hoursWorked: s.hours_worked,
      points: 0,
      calculatedAmount: amount,
    });
  }

  // 2. Distribute remaining by points (hours × points_per_hour)
  const withPoints = pointsStaff.map((s) => ({
    ...s,
    points: s.hours_worked * (s.points_per_hour ?? 1),
  }));
  const totalPoints = withPoints.reduce((sum, s) => sum + s.points, 0);

  if (totalPoints === 0 || remaining === 0) {
    for (const s of withPoints) {
      allocations.push({
        staffId: s.staffId,
        name: s.name,
        distributionType: 'points',
        hoursWorked: s.hours_worked,
        points: s.points,
        calculatedAmount: 0,
      });
    }
    return allocations;
  }

  // Floor each share, then distribute leftover cents by largest fraction
  const withRaw = withPoints.map((s) => ({
    ...s,
    raw: (s.points / totalPoints) * remaining,
  }));
  const floored = withRaw.map((s) => ({
    ...s,
    flooredAmount: Math.floor(s.raw),
    fraction: s.raw - Math.floor(s.raw),
  }));

  const totalFloored = floored.reduce((sum, s) => sum + s.flooredAmount, 0);
  const remCents = remaining - totalFloored;
  const byFraction = [...floored].sort((a, b) => b.fraction - a.fraction);
  const finalAmounts = new Map(floored.map((s) => [s.staffId, s.flooredAmount]));

  for (let i = 0; i < remCents; i++) {
    const recipient = byFraction[i % byFraction.length];
    finalAmounts.set(recipient.staffId, (finalAmounts.get(recipient.staffId) ?? 0) + 1);
  }

  for (const s of withPoints) {
    allocations.push({
      staffId: s.staffId,
      name: s.name,
      distributionType: 'points',
      hoursWorked: s.hours_worked,
      points: s.points,
      calculatedAmount: finalAmounts.get(s.staffId) ?? 0,
    });
  }

  return allocations;
}

// ─── Shift summary ────────────────────────────────────────────────────────────

export interface ServerInput {
  id: string;
  name: string;
  sales: number;      // CAD cents
  tipsEarned: number; // CAD cents (tips personally received)
  hoursWorked: number;
}

export interface ServerBreakdown extends ServerInput {
  directTipOuts: TipOutBreakdownItem[];
  housePoolContribution: number;
  totalTipOut: number;
  tipsKept: number;
}

export interface ShiftSummaryResult {
  perServerBreakdown: ServerBreakdown[];
  totalHousePool: number;  // total cents flowing into house pool from all servers
  totalTipOuts: number;    // total cents tipped out across all servers
  totalTipsKept: number;   // total tips kept by all servers combined
}

/**
 * Summarise tip-outs across all servers for a shift.
 *
 * @param servers      Servers with their individual sales, tips earned, and hours.
 * @param tipOutRules  Tip-out rules applied to each server's sales.
 */
export function calculateShiftSummary(
  servers: ServerInput[],
  tipOutRules: TipOutRule[],
): ShiftSummaryResult {
  const perServerBreakdown: ServerBreakdown[] = servers.map((server) => {
    const tipOut = calculateServerTipOut(server.sales, server.tipsEarned, tipOutRules);
    return { ...server, ...tipOut };
  });

  const totalHousePool = perServerBreakdown.reduce(
    (sum, s) => sum + s.housePoolContribution,
    0,
  );
  const totalTipOuts = perServerBreakdown.reduce((sum, s) => sum + s.totalTipOut, 0);
  const totalTipsKept = perServerBreakdown.reduce((sum, s) => sum + s.tipsKept, 0);

  return { perServerBreakdown, totalHousePool, totalTipOuts, totalTipsKept };
}
