export interface Plan {
  id: string;
  name: string;
  price: number;
  annualPrice?: number;
  period: string;
  features: string[];
  highlighted?: boolean;
  popular?: boolean;
  cta?: string;
}

export interface Subscription {
  id: string;
  planId: string;
  planName: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'draft' | 'void' | 'uncollectible';
  pdfUrl?: string;
}

export interface BillingData {
  subscription: Subscription | null;
  invoices: Invoice[];
  plans: Plan[];
}

export interface CorralConfig {
  plans: Plan[];
  features?: Record<string, string[]>;
}
