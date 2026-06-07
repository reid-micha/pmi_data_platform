import type { HoldingItem } from '../types/holdings';

export type ContractWithProbability = Pick<HoldingItem, 'yesPercent' | 'probability'>;

/** API returns 0–1 `probability`; war holdings may already use `yesPercent` (0–100). */
export function contractYesPercent(contract: ContractWithProbability): number | null {
    // if (contract.yesPercent != null) return contract.yesPercent;
    if (contract.probability != null) return contract.probability * 100;
    return null;
}

/** Attach computed `yesPercent` so list/grid views read the same field as sort. */
export function normalizeMagaHoldingContract<T extends ContractWithProbability>(contract: T): T {
    return { ...contract, yesPercent: contractYesPercent(contract) ?? undefined };
}

export function normalizeMagaHoldings<T extends ContractWithProbability>(contracts: T[]): T[] {
    return contracts.map(normalizeMagaHoldingContract);
}
