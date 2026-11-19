import { BPS_DENOMINATOR } from './constants';

export interface CommissionSplit {
  platformFeePaise: number;
  organiserSharePaise: number;
}

/** Splits an amount (paise) by commission in basis points. The two parts always sum to the amount. */
export function splitCommission(amountPaise: number, commissionBps: number): CommissionSplit {
  const platformFeePaise = Math.round((amountPaise * commissionBps) / BPS_DENOMINATOR);
  return { platformFeePaise, organiserSharePaise: amountPaise - platformFeePaise };
}

export function formatINR(paise: number): string {
  const whole = paise % 100 === 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(paise / 100);
}

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);
export const bpsToPercent = (bps: number): number => bps / 100;
export const percentToBps = (percent: number): number => Math.round(percent * 100);
