export interface ApplyReferralParams {
  userId: string;
  referralCode: string | null | undefined;
}

export interface ApplyReferralResult {
  applied: boolean;
  reason?: string;
  bonusGranted?: boolean;
  bonusError?: string;
}

export interface CommissionResult {
  created: boolean;
  commissionId?: string;
  amount?: number;
  error?: string;
}

export interface RequestWithdrawalParams {
  userId: string;
  amount: number;
  paymentMethod: string;
  paymentAccount: string;
  currency?: string;
}

export interface RequestWithdrawalResult {
  success: boolean;
  withdrawalId?: string;
  error?: string;
}

export interface ProcessWithdrawalParams {
  withdrawalId: string;
  status: 'processing' | 'completed' | 'rejected';
  adminNote?: string;
  processedBy: string;
}

export interface ProcessWithdrawalResult {
  success: boolean;
  error?: string;
}
