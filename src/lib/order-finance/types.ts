import type {
  FinanceAmountRole,
  FinanceSyncStatus,
} from "@/db/schema";

export type FinanceEventInput = {
  dedupeKey: string;
  externalEventId?: string | null;
  eventType: string;
  eventStatus?: string | null;
  postedAt?: Date | null;
  sourceApiVersion: string;
  rawData: Record<string, unknown>;
  components: FinanceComponentInput[];
};

export type FinanceComponentInput = {
  externalItemId?: string | null;
  sku?: string | null;
  amountRole: FinanceAmountRole;
  code: string;
  amount: string;
  currency?: string | null;
  quantity?: number | null;
  rawData?: Record<string, unknown>;
};

export type PersistOrderFinanceInput = {
  orderId: number;
  channelId: number;
  source: string;
  status: FinanceSyncStatus;
  events: FinanceEventInput[];
  error?: {
    code?: string | null;
    message?: string | null;
  };
};

export type OrderFinanceSummary = {
  syncStatus: FinanceSyncStatus | null;
  source: string | null;
  lastAttemptAt: Date | null;
  syncedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  eventCount: number;
  latestPostedAt: Date | null;
  principal: number;
  tax: number;
  shippingRevenue: number;
  discount: number;
  orderFeeRevenue: number;
  marketplaceFee: number;
  paymentFee: number;
  withholding: number;
  refund: number;
  adjustment: number;
  other: number;
  netProfitAdjustment: number;
};

