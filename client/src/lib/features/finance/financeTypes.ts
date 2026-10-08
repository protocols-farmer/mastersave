//src/lib/features/finance/financeTypes.ts

export interface AllocationRules {
  spend_percentage: number;
  save_percentage: number;
  grow_percentage: number;
}

export interface WalletBalances {
  spend_balance: string | number;
  save_balance: string | number;
  grow_balance: string | number;
}

export interface FinanceDashboardData extends WalletBalances, AllocationRules {}

export interface DashboardResponse {
  dashboard: FinanceDashboardData;
}

export interface UpdateRulesDTO {
  spendPercentage: number;
  savePercentage: number;
  growPercentage: number;
}

export interface UpdateRulesResponse {
  message: string;
  rules: {
    user_id: string;
    spend_percentage: number;
    save_percentage: number;
    grow_percentage: number;
    updated_at: string;
  };
}

export interface TriggerDepositDTO {
  amount: number;
  phoneNumber: string;
  email?: string;
}

export interface TriggerDepositResponse {
  message: string;
  flutterwave: {
    status: string;
    message: string;
    data?: {
      id: number;
      tx_ref: string;
      flw_ref: string;
      device_fingerprint: string;
      amount: number;
      charged_amount: number;
      app_fee: number;
      merchant_fee: number;
      processor_response: string;
      auth_model: string;
      currency: string;
      ip: string;
      narration: string;
      status: string;
      payment_type: string;
      created_at: string;
      account_id: number;
      meta_data?: Record<string, unknown>;
    };
  };
}

export interface SpendMoneyDTO {
  amount: number;
}

export interface SpendMoneyResponse {
  message: string;
}

export interface SaveMoneyDTO {
  amount: number;
  agreeToPenalty: boolean;
}

export interface SaveMoneyResponse {
  message: string;
  details?: {
    requestedAmount: number;
    totalDeducted: number;
    penaltyApplied: boolean;
  };
}

export interface GrowMoneyDTO {
  amount: number;
  breakLock: boolean;
}

export interface GrowMoneyResponse {
  message: string;
  details?: {
    requestedAmount: number;
    principalReturned: number;
    interestForfeited: boolean;
  };
}
