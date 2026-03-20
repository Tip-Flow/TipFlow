export type Role = 'server' | 'bartender' | 'runner' | 'host' | 'kitchen';

export interface StaffInput {
  id: string;
  name: string;
  role: Role;
  hoursWorked: number;
}

export interface TipAllocationResult {
  staffId: string;
  name: string;
  role: Role;
  hoursWorked: number;
  weight: number;
  calculatedAmount: number; // CAD cents
  percentage: number; // % of total tips this person received
}

export interface TipCalculationResult {
  allocations: TipAllocationResult[];
  totalWeight: number;
  totalAllocated: number; // CAD cents — must equal totalTips
  remainder: number; // cents distributed via largest-fraction tie-breaking
}

/**
 * Calculate tip allocations for a shift.
 *
 * @param totalTips   Total tips collected, in CAD cents.
 * @param staffList   Staff working the shift (excluded staff should not appear here).
 * @param roleWeights Decimal multiplier per role, e.g. { server: 0.70, bartender: 0.60 }.
 *                    Each person's weight = roleWeight × hoursWorked.
 *                    Roles not present in the map default to 0 weight.
 *
 * @returns TipCalculationResult — allocations sum exactly to totalTips (no rounding loss).
 *
 * @throws Error if totalTips is negative, staffList is empty, or all weights resolve to 0.
 */
export function calculateTips(
  totalTips: number,
  staffList: StaffInput[],
  roleWeights: Partial<Record<Role, number>>,
): TipCalculationResult {
  if (totalTips < 0) throw new Error('totalTips must be non-negative');
  if (staffList.length === 0) throw new Error('staffList must not be empty');

  // Debug: log inputs
  console.log('[calculateTips] staffList:', JSON.stringify(staffList.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    hoursWorked: s.hoursWorked,
  })), null, 2));
  console.log('[calculateTips] roleWeights:', JSON.stringify(roleWeights, null, 2));

  // 1. Compute individual weights
  //    Normalize role to lowercase to guard against Supabase returning mixed-case values
  //    e.g. "Server" instead of "server" — a mismatch silently produces weight 0
  const weighted = staffList.map((s) => {
    const normalizedRole = s.role?.toLowerCase() as Role;
    const roleWeight = roleWeights[normalizedRole] ?? 0;
    const weight = roleWeight * s.hoursWorked;
    console.log(
      `[calculateTips] ${s.name} | role: "${s.role}" → normalized: "${normalizedRole}" | roleWeight: ${roleWeight} | hours: ${s.hoursWorked} | weight: ${weight}`,
    );
    return { ...s, role: normalizedRole, weight };
  });

  const totalWeight = weighted.reduce((sum, s) => sum + s.weight, 0);
  console.log('[calculateTips] totalWeight:', totalWeight);

  if (totalWeight === 0) {
    throw new Error(
      'Total weight is zero — verify role weights and hours worked are greater than 0',
    );
  }

  // 2. Calculate raw (fractional) cent amounts
  const withRaw = weighted.map((s) => ({
    ...s,
    raw: (s.weight / totalWeight) * totalTips,
  }));

  // 3. Floor to whole cents
  const floored = withRaw.map((s) => ({
    ...s,
    amount: Math.floor(s.raw),
    fraction: s.raw - Math.floor(s.raw),
  }));

  const totalFloored = floored.reduce((sum, s) => sum + s.amount, 0);
  const remainder = totalTips - totalFloored; // cents left to distribute

  // 4. Distribute remainder cents to those with the largest fractional parts
  const byFractionDesc = [...floored].sort((a, b) => b.fraction - a.fraction);
  const finalAmounts = new Map(floored.map((s) => [s.id, s.amount]));

  for (let i = 0; i < remainder; i++) {
    const recipient = byFractionDesc[i % byFractionDesc.length];
    finalAmounts.set(recipient.id, (finalAmounts.get(recipient.id) ?? 0) + 1);
  }

  // 5. Build result
  const allocations: TipAllocationResult[] = weighted.map((s) => {
    const calculatedAmount = finalAmounts.get(s.id) ?? 0;
    return {
      staffId: s.id,
      name: s.name,
      role: s.role,
      hoursWorked: s.hoursWorked,
      weight: s.weight,
      calculatedAmount,
      percentage: totalTips > 0 ? (calculatedAmount / totalTips) * 100 : 0,
    };
  });

  const totalAllocated = allocations.reduce((sum, a) => sum + a.calculatedAmount, 0);

  // Invariant: should never fail given correct integer arithmetic above
  if (totalAllocated !== totalTips) {
    throw new Error(
      `Allocation mismatch: distributed ${totalAllocated}¢ but expected ${totalTips}¢`,
    );
  }

  return { allocations, totalWeight, totalAllocated, remainder };
}
