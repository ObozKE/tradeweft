import type {
  VerificationMethod,
  VerificationStatus,
  ProviderVerificationAggregateStatus,
  Database,
} from '@/lib/supabase/database.types';

export type {
  VerificationMethod,
  VerificationStatus,
  ProviderVerificationAggregateStatus,
};

export type PlatformKey =
  | 'github'
  | 'figma'
  | 'behance'
  | 'dribbble'
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'google_business'
  | 'personal_website';

export interface PlatformConfig {
  key: PlatformKey;
  label: string;
  method: VerificationMethod;
  placeholder: string;
  allowedHosts: string[];
  extractHandle: (url: URL) => string | null;
  normalizeUrl: (url: URL) => string;
  instructionKey: string;
}

export type PortfolioLinkRow = Database['public']['Tables']['portfolio_links']['Row'];
export type ProviderVerificationRow = Database['public']['Tables']['provider_verification']['Row'];
export type VerificationAuditLogRow = Database['public']['Tables']['verification_audit_log']['Row'];

export interface VerificationActionResult {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  linkId?: string;
  challengeCode?: string;
  status?: VerificationStatus;
}
