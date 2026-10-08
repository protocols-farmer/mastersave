export interface AllocationRuleDTO {
  spendPercentage: number;
  savePercentage: number;
  growPercentage: number;
}

export interface DepositDTO {
  amount: number;
}

export interface WithdrawDTO {
  amount: number;
  bucket: "spend" | "save" | "grow";
}

export interface SaveMoneyDTO {
  amount: number;
  agreeToPenalty: boolean;
}

export interface GrowMoneyDTO {
  amount: number;
  breakLock: boolean;
}
