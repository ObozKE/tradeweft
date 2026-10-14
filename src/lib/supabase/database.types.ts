export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type LocationLevel = 'region' | 'city' | 'area';
export type AccountType = 'freelancer' | 'business';
export type AppRole = 'user' | 'admin' | 'support' | 'verifier' | 'finance';
export type PackageStatus = 'draft' | 'published' | 'paused' | 'archived' | 'removed';
export type DeliveryMode = 'in_person' | 'remote' | 'hybrid';
export type AgreementStatus =
  | 'proposed'
  | 'active'
  | 'completed'
  | 'declined'
  | 'withdrawn'
  | 'expired'
  | 'cancelled'
  | 'disputed';
export type AgreementSide = 'proposer_gives' | 'recipient_gives';
export type ContactChannel = 'phone' | 'whatsapp' | 'email';
export type ReviewStatus = 'pending' | 'revealed' | 'withdrawn' | 'removed';
export type ReportReason = 'harassment' | 'spam' | 'extortion' | 'false_claim' | 'pii_leak' | 'other';
export type ReportStatus = 'pending' | 'investigating' | 'actioned' | 'dismissed';
export type ReputationTier = 'new' | 'building' | 'established';
export type VerificationMethod = 'oauth' | 'domain' | 'manual';
export type VerificationStatus =
  | 'submitted'
  | 'awaiting_proof'
  | 'pending_review'
  | 'verified'
  | 'rejected'
  | 'revoked'
  | 'expired';
export type ProviderVerificationAggregateStatus = 'none' | 'pending' | 'verified';
export type MediaKind = 'package_cover' | 'package_gallery' | 'evidence';
export type MediaStatus = 'pending' | 'processing' | 'ready' | 'rejected' | 'deleted';
export type PublishGateMode = 'none' | 'link_pending_or_verified' | 'verified';
export type PaymentProviderCode = 'mpesa_daraja' | 'airtel_money' | 'mtn_momo';
export type PaymentStatus = 'created' | 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out' | 'refunded';
export type PaymentPurpose = 'top_ad' | 'boost_period';
export type LedgerEntryType = 'charge' | 'refund' | 'adjustment';
export type PromotionStatus = 'held' | 'active' | 'expired' | 'cancelled';
export type SubscriptionStatus = 'pending' | 'active' | 'grace' | 'expired' | 'cancelled';
export type BillingMode = 'prepaid_stk' | 'standing_order';

export interface Database {
  public: {
    Tables: {
      countries: {
        Row: {
          code: string;
          name: string;
          currency_code: string;
          default_locale: string;
          phone_code: string;
          timezone: string;
          is_active: boolean;
          publish_gate: PublishGateMode;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          name: string;
          currency_code: string;
          default_locale?: string;
          phone_code: string;
          timezone?: string;
          is_active?: boolean;
          publish_gate?: PublishGateMode;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          name?: string;
          currency_code?: string;
          default_locale?: string;
          phone_code?: string;
          timezone?: string;
          is_active?: boolean;
          publish_gate?: PublishGateMode;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      locations: {
        Row: {
          id: string;
          country_code: string;
          parent_id: string | null;
          level: LocationLevel;
          name: string;
          slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          country_code: string;
          parent_id?: string | null;
          level: LocationLevel;
          name: string;
          slug: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          country_code?: string;
          parent_id?: string | null;
          level?: LocationLevel;
          name?: string;
          slug?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'locations_country_code_fkey';
            columns: ['country_code'];
            referencedRelation: 'countries';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'locations_parent_id_fkey';
            columns: ['parent_id'];
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          account_type: AccountType | null;
          business_name: string | null;
          country_code: string | null;
          city_id: string | null;
          area_id: string | null;
          remote_delivery: boolean;
          locale: string;
          terms_accepted_at: string | null;
          terms_version: string | null;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          account_type?: AccountType | null;
          business_name?: string | null;
          country_code?: string | null;
          city_id?: string | null;
          area_id?: string | null;
          remote_delivery?: boolean;
          locale?: string;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          account_type?: AccountType | null;
          business_name?: string | null;
          country_code?: string | null;
          city_id?: string | null;
          area_id?: string | null;
          remote_delivery?: boolean;
          locale?: string;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_country_code_fkey';
            columns: ['country_code'];
            referencedRelation: 'countries';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'profiles_city_id_fkey';
            columns: ['city_id'];
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_area_id_fkey';
            columns: ['area_id'];
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
        ];
      };
      user_roles: {
        Row: {
          user_id: string;
          role: AppRole;
          created_at: string;
        };
        Insert: {
          user_id: string;
          role?: AppRole;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          role?: AppRole;
          created_at?: string;
        };
        Relationships: [];
      };
      service_categories: {
        Row: {
          id: string;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          slug: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_categories_parent_id_fkey';
            columns: ['parent_id'];
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      service_category_translations: {
        Row: {
          category_id: string;
          locale: string;
          name: string;
        };
        Insert: {
          category_id: string;
          locale: string;
          name: string;
        };
        Update: {
          category_id?: string;
          locale?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_category_translations_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      service_packages: {
        Row: {
          id: string;
          provider_id: string;
          category_id: string;
          status: PackageStatus;
          title: string;
          summary: string;
          description: string;
          content_locale: string;
          delivery_mode: DeliveryMode;
          country_code: string;
          city_id: string | null;
          area_id: string | null;
          turnaround_days: number;
          capacity_per_month: number | null;
          indicative_value_minor: number | null;
          currency_code: string;
          deliverables: Json;
          exclusions: Json;
          current_version_id: string | null;
          published_at: string | null;
          rank_ts: string;
          created_at: string;
          updated_at: string;
          search_vector?: unknown;
        };
        Insert: {
          id?: string;
          provider_id: string;
          category_id: string;
          status?: PackageStatus;
          title: string;
          summary: string;
          description: string;
          content_locale?: string;
          delivery_mode: DeliveryMode;
          country_code: string;
          city_id?: string | null;
          area_id?: string | null;
          turnaround_days: number;
          capacity_per_month?: number | null;
          indicative_value_minor?: number | null;
          currency_code?: string;
          deliverables?: Json;
          exclusions?: Json;
          current_version_id?: string | null;
          published_at?: string | null;
          rank_ts?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          provider_id?: string;
          category_id?: string;
          status?: PackageStatus;
          title?: string;
          summary?: string;
          description?: string;
          content_locale?: string;
          delivery_mode?: DeliveryMode;
          country_code?: string;
          city_id?: string | null;
          area_id?: string | null;
          turnaround_days?: number;
          capacity_per_month?: number | null;
          indicative_value_minor?: number | null;
          currency_code?: string;
          deliverables?: Json;
          exclusions?: Json;
          current_version_id?: string | null;
          published_at?: string | null;
          rank_ts?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_packages_provider_id_fkey';
            columns: ['provider_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_packages_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_packages_country_code_fkey';
            columns: ['country_code'];
            referencedRelation: 'countries';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'service_packages_city_id_fkey';
            columns: ['city_id'];
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_packages_area_id_fkey';
            columns: ['area_id'];
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
        ];
      };
      service_package_seeking_categories: {
        Row: {
          package_id: string;
          category_id: string;
          created_at: string;
        };
        Insert: {
          package_id: string;
          category_id: string;
          created_at?: string;
        };
        Update: {
          package_id?: string;
          category_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_package_seeking_categories_package_id_fkey';
            columns: ['package_id'];
            referencedRelation: 'service_packages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_package_seeking_categories_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      service_package_versions: {
        Row: {
          id: string;
          package_id: string;
          version_number: number;
          snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          package_id: string;
          version_number: number;
          snapshot: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          package_id?: string;
          version_number?: number;
          snapshot?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_package_versions_package_id_fkey';
            columns: ['package_id'];
            referencedRelation: 'service_packages';
            referencedColumns: ['id'];
          },
        ];
      };
      domain_events: {
        Row: {
          id: string;
          aggregate_type: string;
          aggregate_id: string;
          event_type: string;
          actor_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          aggregate_type: string;
          aggregate_id: string;
          event_type: string;
          actor_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          aggregate_type?: string;
          aggregate_id?: string;
          event_type?: string;
          actor_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      agreements: {
        Row: {
          id: string;
          country_code: string;
          proposer_id: string;
          recipient_id: string;
          status: AgreementStatus;
          current_revision_no: number;
          turn_user_id: string;
          expires_at: string;
          accepted_revision_id: string | null;
          terms_hash: string | null;
          trade_terms_version: string;
          accepted_at: string | null;
          completed_at: string | null;
          cancellation_requested_by: string | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          disputed_by: string | null;
          dispute_reason: string | null;
          disputed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          country_code: string;
          proposer_id: string;
          recipient_id: string;
          status?: AgreementStatus;
          current_revision_no?: number;
          turn_user_id: string;
          expires_at?: string;
          accepted_revision_id?: string | null;
          terms_hash?: string | null;
          trade_terms_version?: string;
          accepted_at?: string | null;
          completed_at?: string | null;
          cancellation_requested_by?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          disputed_by?: string | null;
          dispute_reason?: string | null;
          disputed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          country_code?: string;
          proposer_id?: string;
          recipient_id?: string;
          status?: AgreementStatus;
          current_revision_no?: number;
          turn_user_id?: string;
          expires_at?: string;
          accepted_revision_id?: string | null;
          terms_hash?: string | null;
          trade_terms_version?: string;
          accepted_at?: string | null;
          completed_at?: string | null;
          cancellation_requested_by?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          disputed_by?: string | null;
          dispute_reason?: string | null;
          disputed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agreements_country_code_fkey';
            columns: ['country_code'];
            referencedRelation: 'countries';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'agreements_proposer_id_fkey';
            columns: ['proposer_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agreements_recipient_id_fkey';
            columns: ['recipient_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agreements_turn_user_id_fkey';
            columns: ['turn_user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_agreements_accepted_revision';
            columns: ['accepted_revision_id'];
            referencedRelation: 'agreement_revisions';
            referencedColumns: ['id'];
          },
        ];
      };
      agreement_revisions: {
        Row: {
          id: string;
          agreement_id: string;
          revision_no: number;
          authored_by: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agreement_id: string;
          revision_no: number;
          authored_by: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agreement_id?: string;
          revision_no?: number;
          authored_by?: string;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agreement_revisions_agreement_id_fkey';
            columns: ['agreement_id'];
            referencedRelation: 'agreements';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agreement_revisions_authored_by_fkey';
            columns: ['authored_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      agreement_lines: {
        Row: {
          id: string;
          revision_id: string;
          side: AgreementSide;
          package_version_id: string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          revision_id: string;
          side: AgreementSide;
          package_version_id: string;
          quantity: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          revision_id?: string;
          side?: AgreementSide;
          package_version_id?: string;
          quantity?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agreement_lines_revision_id_fkey';
            columns: ['revision_id'];
            referencedRelation: 'agreement_revisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agreement_lines_package_version_id_fkey';
            columns: ['package_version_id'];
            referencedRelation: 'service_package_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      agreement_fulfilment: {
        Row: {
          id: string;
          agreement_id: string;
          side: AgreementSide;
          giving_user_id: string;
          receiving_user_id: string;
          delivered_marked_at: string | null;
          delivered_marked_by: string | null;
          receipt_confirmed_at: string | null;
          receipt_confirmed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agreement_id: string;
          side: AgreementSide;
          giving_user_id: string;
          receiving_user_id: string;
          delivered_marked_at?: string | null;
          delivered_marked_by?: string | null;
          receipt_confirmed_at?: string | null;
          receipt_confirmed_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agreement_id?: string;
          side?: AgreementSide;
          giving_user_id?: string;
          receiving_user_id?: string;
          delivered_marked_at?: string | null;
          delivered_marked_by?: string | null;
          receipt_confirmed_at?: string | null;
          receipt_confirmed_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agreement_fulfilment_agreement_id_fkey';
            columns: ['agreement_id'];
            referencedRelation: 'agreements';
            referencedColumns: ['id'];
          },
        ];
      };
      agreement_events: {
        Row: {
          id: string;
          agreement_id: string;
          actor_id: string | null;
          event_type: string;
          from_status: AgreementStatus | null;
          to_status: AgreementStatus | null;
          revision_no: number | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          agreement_id: string;
          actor_id?: string | null;
          event_type: string;
          from_status?: AgreementStatus | null;
          to_status?: AgreementStatus | null;
          revision_no?: number | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          agreement_id?: string;
          actor_id?: string | null;
          event_type?: string;
          from_status?: AgreementStatus | null;
          to_status?: AgreementStatus | null;
          revision_no?: number | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agreement_events_agreement_id_fkey';
            columns: ['agreement_id'];
            referencedRelation: 'agreements';
            referencedColumns: ['id'];
          },
        ];
      };
      profile_contacts: {
        Row: {
          user_id: string;
          phone_e164: string;
          whatsapp: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          phone_e164: string;
          whatsapp?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          phone_e164?: string;
          whatsapp?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profile_contacts_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      agreement_contact_shares: {
        Row: {
          id: string;
          agreement_id: string;
          user_id: string;
          channels: string[];
          consented_at: string;
        };
        Insert: {
          id?: string;
          agreement_id: string;
          user_id: string;
          channels: string[];
          consented_at?: string;
        };
        Update: {
          id?: string;
          agreement_id?: string;
          user_id?: string;
          channels?: string[];
          consented_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agreement_contact_shares_agreement_id_fkey';
            columns: ['agreement_id'];
            referencedRelation: 'agreements';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          payload: Json;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          payload?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          payload?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      idempotency_keys: {
        Row: {
          key: string;
          user_id: string;
          action: string;
          response: Json;
          created_at: string;
        };
        Insert: {
          key: string;
          user_id: string;
          action: string;
          response: Json;
          created_at?: string;
        };
        Update: {
          key?: string;
          user_id?: string;
          action?: string;
          response?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      trade_terms_versions: {
        Row: {
          version: string;
          title: string;
          content_md: string;
          includes_public_ledger: boolean;
          effective_from: string;
          created_at: string;
        };
        Insert: {
          version: string;
          title: string;
          content_md: string;
          includes_public_ledger?: boolean;
          effective_from?: string;
          created_at?: string;
        };
        Update: {
          version?: string;
          title?: string;
          content_md?: string;
          includes_public_ledger?: boolean;
          effective_from?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          agreement_id: string;
          reviewer_id: string;
          reviewee_id: string;
          overall_rating: number;
          quality_rating: number;
          communication_rating: number;
          timeliness_rating: number;
          would_trade_again: boolean;
          review_text: string | null;
          status: ReviewStatus;
          review_window_ends_at: string;
          editable_until: string;
          revealed_at: string | null;
          withdrawn_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agreement_id: string;
          reviewer_id: string;
          reviewee_id: string;
          overall_rating: number;
          quality_rating: number;
          communication_rating: number;
          timeliness_rating: number;
          would_trade_again?: boolean;
          review_text?: string | null;
          status?: ReviewStatus;
          review_window_ends_at?: string;
          editable_until?: string;
          revealed_at?: string | null;
          withdrawn_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agreement_id?: string;
          reviewer_id?: string;
          reviewee_id?: string;
          overall_rating?: number;
          quality_rating?: number;
          communication_rating?: number;
          timeliness_rating?: number;
          would_trade_again?: boolean;
          review_text?: string | null;
          status?: ReviewStatus;
          review_window_ends_at?: string;
          editable_until?: string;
          revealed_at?: string | null;
          withdrawn_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reviews_agreement_id_fkey';
            columns: ['agreement_id'];
            referencedRelation: 'agreements';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_reviewer_id_fkey';
            columns: ['reviewer_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_reviewee_id_fkey';
            columns: ['reviewee_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      review_replies: {
        Row: {
          id: string;
          review_id: string;
          author_id: string;
          reply_text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          review_id: string;
          author_id: string;
          reply_text: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          review_id?: string;
          author_id?: string;
          reply_text?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'review_replies_review_id_fkey';
            columns: ['review_id'];
            referencedRelation: 'reviews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'review_replies_author_id_fkey';
            columns: ['author_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      review_reports: {
        Row: {
          id: string;
          review_id: string;
          reporter_id: string;
          reason: ReportReason;
          details: string | null;
          status: ReportStatus;
          resolution_notes: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          review_id: string;
          reporter_id: string;
          reason: ReportReason;
          details?: string | null;
          status?: ReportStatus;
          resolution_notes?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          review_id?: string;
          reporter_id?: string;
          reason?: ReportReason;
          details?: string | null;
          status?: ReportStatus;
          resolution_notes?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'review_reports_review_id_fkey';
            columns: ['review_id'];
            referencedRelation: 'reviews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'review_reports_reporter_id_fkey';
            columns: ['reporter_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ledger_entries: {
        Row: {
          id: string;
          agreement_id: string;
          provider_id: string;
          counterparty_id: string;
          contract_ref: string;
          country_code: string;
          trade_terms_version: string;
          terms_hash: string;
          completed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          agreement_id: string;
          provider_id: string;
          counterparty_id: string;
          contract_ref: string;
          country_code: string;
          trade_terms_version: string;
          terms_hash: string;
          completed_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          agreement_id?: string;
          provider_id?: string;
          counterparty_id?: string;
          contract_ref?: string;
          country_code?: string;
          trade_terms_version?: string;
          terms_hash?: string;
          completed_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ledger_entries_agreement_id_fkey';
            columns: ['agreement_id'];
            referencedRelation: 'agreements';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_provider_id_fkey';
            columns: ['provider_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_counterparty_id_fkey';
            columns: ['counterparty_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      provider_reputation: {
        Row: {
          provider_id: string;
          score: number;
          tier: ReputationTier;
          completed_trades_count: number;
          distinct_partners_count: number;
          avg_overall_rating: number | null;
          would_trade_again_pct: number | null;
          avg_quality_rating: number | null;
          avg_communication_rating: number | null;
          avg_timeliness_rating: number | null;
          is_score_visible: boolean;
          calculation_version: number;
          last_computed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          provider_id: string;
          score?: number;
          tier?: ReputationTier;
          completed_trades_count?: number;
          distinct_partners_count?: number;
          avg_overall_rating?: number | null;
          would_trade_again_pct?: number | null;
          avg_quality_rating?: number | null;
          avg_communication_rating?: number | null;
          avg_timeliness_rating?: number | null;
          is_score_visible?: boolean;
          calculation_version?: number;
          last_computed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          provider_id?: string;
          score?: number;
          tier?: ReputationTier;
          completed_trades_count?: number;
          distinct_partners_count?: number;
          avg_overall_rating?: number | null;
          would_trade_again_pct?: number | null;
          avg_quality_rating?: number | null;
          avg_communication_rating?: number | null;
          avg_timeliness_rating?: number | null;
          is_score_visible?: boolean;
          calculation_version?: number;
          last_computed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_reputation_provider_id_fkey';
            columns: ['provider_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reputation_flags: {
        Row: {
          id: string;
          provider_id: string;
          flag_type: string;
          severity: string;
          details: Json;
          is_active: boolean;
          detected_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          provider_id: string;
          flag_type: string;
          severity?: string;
          details?: Json;
          is_active?: boolean;
          detected_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          provider_id?: string;
          flag_type?: string;
          severity?: string;
          details?: Json;
          is_active?: boolean;
          detected_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reputation_flags_provider_id_fkey';
            columns: ['provider_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      review_moderation_log: {
        Row: {
          id: string;
          review_id: string;
          admin_id: string;
          action: string;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          review_id: string;
          admin_id: string;
          action: string;
          reason: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          review_id?: string;
          admin_id?: string;
          action?: string;
          reason?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      domain_event_deliveries: {
        Row: {
          id: string;
          event_id: string;
          handler_name: string;
          status: string;
          attempt_count: number;
          max_attempts: number;
          next_retry_at: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          handler_name: string;
          status?: string;
          attempt_count?: number;
          max_attempts?: number;
          next_retry_at?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          handler_name?: string;
          status?: string;
          attempt_count?: number;
          max_attempts?: number;
          next_retry_at?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'domain_event_deliveries_event_id_fkey';
            columns: ['event_id'];
            referencedRelation: 'domain_events';
            referencedColumns: ['id'];
          },
        ];
      };
      media_assets: {
        Row: {
          id: string;
          owner_id: string;
          kind: MediaKind;
          bucket: string;
          path: string;
          status: MediaStatus;
          mime: string;
          bytes: number;
          width: number | null;
          height: number | null;
          sha256: string | null;
          blur_data_url: string | null;
          variants: Json;
          rejection_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          kind: MediaKind;
          bucket: string;
          path: string;
          status?: MediaStatus;
          mime: string;
          bytes: number;
          width?: number | null;
          height?: number | null;
          sha256?: string | null;
          blur_data_url?: string | null;
          variants?: Json;
          rejection_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          kind?: MediaKind;
          bucket?: string;
          path?: string;
          status?: MediaStatus;
          mime?: string;
          bytes?: number;
          width?: number | null;
          height?: number | null;
          sha256?: string | null;
          blur_data_url?: string | null;
          variants?: Json;
          rejection_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'media_assets_owner_id_fkey';
            columns: ['owner_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      portfolio_links: {
        Row: {
          id: string;
          user_id: string;
          provider_key: string;
          url: string;
          canonical_url: string;
          external_account_id: string | null;
          handle: string | null;
          method: VerificationMethod;
          status: VerificationStatus;
          challenge_code: string | null;
          challenge_expires_at: string | null;
          evidence_asset_id: string | null;
          reviewed_by: string | null;
          reject_reason: string | null;
          reject_note: string | null;
          verified_at: string | null;
          last_checked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider_key: string;
          url: string;
          canonical_url: string;
          external_account_id?: string | null;
          handle?: string | null;
          method: VerificationMethod;
          status?: VerificationStatus;
          challenge_code?: string | null;
          challenge_expires_at?: string | null;
          evidence_asset_id?: string | null;
          reviewed_by?: string | null;
          reject_reason?: string | null;
          reject_note?: string | null;
          verified_at?: string | null;
          last_checked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider_key?: string;
          url?: string;
          canonical_url?: string;
          external_account_id?: string | null;
          handle?: string | null;
          method?: VerificationMethod;
          status?: VerificationStatus;
          challenge_code?: string | null;
          challenge_expires_at?: string | null;
          evidence_asset_id?: string | null;
          reviewed_by?: string | null;
          reject_reason?: string | null;
          reject_note?: string | null;
          verified_at?: string | null;
          last_checked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'portfolio_links_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'portfolio_links_evidence_asset_id_fkey';
            columns: ['evidence_asset_id'];
            referencedRelation: 'media_assets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'portfolio_links_reviewed_by_fkey';
            columns: ['reviewed_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      oauth_states: {
        Row: {
          id: string;
          user_id: string;
          provider_key: string;
          state_hash: string;
          code_verifier: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider_key: string;
          state_hash: string;
          code_verifier: string;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider_key?: string;
          state_hash?: string;
          code_verifier?: string;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'oauth_states_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      provider_verification: {
        Row: {
          provider_id: string;
          status: ProviderVerificationAggregateStatus;
          verified_link_count: number;
          verified_since: string | null;
          updated_at: string;
        };
        Insert: {
          provider_id: string;
          status?: ProviderVerificationAggregateStatus;
          verified_link_count?: number;
          verified_since?: string | null;
          updated_at?: string;
        };
        Update: {
          provider_id?: string;
          status?: ProviderVerificationAggregateStatus;
          verified_link_count?: number;
          verified_since?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_verification_provider_id_fkey';
            columns: ['provider_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      verification_audit_log: {
        Row: {
          id: string;
          link_id: string;
          actor_id: string;
          action: string;
          from_status: VerificationStatus | null;
          to_status: VerificationStatus;
          reason: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          link_id: string;
          actor_id: string;
          action: string;
          from_status?: VerificationStatus | null;
          to_status: VerificationStatus;
          reason?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          link_id?: string;
          actor_id?: string;
          action?: string;
          from_status?: VerificationStatus | null;
          to_status?: VerificationStatus;
          reason?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'verification_audit_log_link_id_fkey';
            columns: ['link_id'];
            referencedRelation: 'portfolio_links';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'verification_audit_log_actor_id_fkey';
            columns: ['actor_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      package_media: {
        Row: {
          package_id: string;
          asset_id: string;
          position: number;
          alt_text: string;
          is_cover: boolean;
          created_at: string;
        };
        Insert: {
          package_id: string;
          asset_id: string;
          position?: number;
          alt_text: string;
          is_cover?: boolean;
          created_at?: string;
        };
        Update: {
          package_id?: string;
          asset_id?: string;
          position?: number;
          alt_text?: string;
          is_cover?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'package_media_package_id_fkey';
            columns: ['package_id'];
            referencedRelation: 'service_packages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'package_media_asset_id_fkey';
            columns: ['asset_id'];
            referencedRelation: 'media_assets';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_providers: {
        Row: {
          code: PaymentProviderCode;
          name: string;
          country_code: string;
          is_enabled: boolean;
          amount_granularity_minor: number;
          config: Json;
          created_at: string;
        };
        Insert: {
          code: PaymentProviderCode;
          name: string;
          country_code: string;
          is_enabled?: boolean;
          amount_granularity_minor?: number;
          config?: Json;
          created_at?: string;
        };
        Update: {
          code?: PaymentProviderCode;
          name?: string;
          country_code?: string;
          is_enabled?: boolean;
          amount_granularity_minor?: number;
          config?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_providers_country_code_fkey';
            columns: ['country_code'];
            referencedRelation: 'countries';
            referencedColumns: ['code'];
          },
        ];
      };
      ad_products: {
        Row: {
          id: string;
          duration_days: number;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          duration_days: number;
          name: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          duration_days?: number;
          name?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          billing_cycle_days: number;
          entitlements: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          description?: string | null;
          billing_cycle_days?: number;
          entitlements?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          billing_cycle_days?: number;
          entitlements?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      price_book: {
        Row: {
          id: string;
          product_id: string;
          product_type: 'ad_product' | 'plan';
          country_code: string;
          currency_code: string;
          amount_minor: number;
          tax_rate_bps: number;
          tax_inclusive: boolean;
          effective_from: string;
          effective_to: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          product_type: 'ad_product' | 'plan';
          country_code: string;
          currency_code: string;
          amount_minor: number;
          tax_rate_bps?: number;
          tax_inclusive?: boolean;
          effective_from?: string;
          effective_to?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          product_type?: 'ad_product' | 'plan';
          country_code?: string;
          currency_code?: string;
          amount_minor?: number;
          tax_rate_bps?: number;
          tax_inclusive?: boolean;
          effective_from?: string;
          effective_to?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'price_book_country_code_fkey';
            columns: ['country_code'];
            referencedRelation: 'countries';
            referencedColumns: ['code'];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          payer_id: string;
          purpose: PaymentPurpose;
          target_id: string;
          amount_minor: number;
          currency_code: string;
          provider: PaymentProviderCode;
          status: PaymentStatus;
          merchant_request_id: string | null;
          checkout_request_id: string | null;
          receipt_number: string | null;
          msisdn: string;
          idempotency_key: string;
          failure_code: string | null;
          failure_reason: string | null;
          attempts: number;
          price_book_id: string | null;
          tax_amount_minor: number;
          price_snapshot: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          payer_id: string;
          purpose: PaymentPurpose;
          target_id: string;
          amount_minor: number;
          currency_code: string;
          provider: PaymentProviderCode;
          status?: PaymentStatus;
          merchant_request_id?: string | null;
          checkout_request_id?: string | null;
          receipt_number?: string | null;
          msisdn: string;
          idempotency_key: string;
          failure_code?: string | null;
          failure_reason?: string | null;
          attempts?: number;
          price_book_id?: string | null;
          tax_amount_minor?: number;
          price_snapshot?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          payer_id?: string;
          purpose?: PaymentPurpose;
          target_id?: string;
          amount_minor?: number;
          currency_code?: string;
          provider?: PaymentProviderCode;
          status?: PaymentStatus;
          merchant_request_id?: string | null;
          checkout_request_id?: string | null;
          receipt_number?: string | null;
          msisdn?: string;
          idempotency_key?: string;
          failure_code?: string | null;
          failure_reason?: string | null;
          attempts?: number;
          price_book_id?: string | null;
          tax_amount_minor?: number;
          price_snapshot?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_payer_id_fkey';
            columns: ['payer_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_events_raw: {
        Row: {
          id: string;
          provider: PaymentProviderCode;
          event_type: string;
          checkout_request_id: string | null;
          payload: Json;
          received_at: string;
          is_redacted: boolean;
          redacted_at: string | null;
        };
        Insert: {
          id?: string;
          provider: PaymentProviderCode;
          event_type: string;
          checkout_request_id?: string | null;
          payload: Json;
          received_at?: string;
          is_redacted?: boolean;
          redacted_at?: string | null;
        };
        Update: {
          id?: string;
          provider?: PaymentProviderCode;
          event_type?: string;
          checkout_request_id?: string | null;
          payload?: Json;
          received_at?: string;
          is_redacted?: boolean;
          redacted_at?: string | null;
        };
        Relationships: [];
      };
      payment_ledger: {
        Row: {
          id: string;
          payment_id: string;
          payer_id: string;
          entry_type: LedgerEntryType;
          amount_minor: number;
          currency_code: string;
          reference_note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          payment_id: string;
          payer_id: string;
          entry_type: LedgerEntryType;
          amount_minor: number;
          currency_code: string;
          reference_note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          payment_id?: string;
          payer_id?: string;
          entry_type?: LedgerEntryType;
          amount_minor?: number;
          currency_code?: string;
          reference_note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_ledger_payment_id_fkey';
            columns: ['payment_id'];
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_promotions: {
        Row: {
          id: string;
          package_id: string;
          provider_id: string;
          country_code: string;
          city_id: string;
          category_id: string;
          slot_no: number;
          period: unknown;
          status: PromotionStatus;
          payment_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          package_id: string;
          provider_id: string;
          country_code: string;
          city_id: string;
          category_id: string;
          slot_no: number;
          period: unknown;
          status?: PromotionStatus;
          payment_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          package_id?: string;
          provider_id?: string;
          country_code?: string;
          city_id?: string;
          category_id?: string;
          slot_no?: number;
          period?: unknown;
          status?: PromotionStatus;
          payment_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_promotions_package_id_fkey';
            columns: ['package_id'];
            referencedRelation: 'service_packages';
            referencedColumns: ['id'];
          },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan_id: string;
          status: SubscriptionStatus;
          current_period_start: string;
          current_period_end: string;
          grace_period_end: string;
          cancel_at_period_end: boolean;
          billing_mode: BillingMode;
          mandate_ref: string | null;
          latest_payment_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_id: string;
          status?: SubscriptionStatus;
          current_period_start: string;
          current_period_end: string;
          grace_period_end: string;
          cancel_at_period_end?: boolean;
          billing_mode?: BillingMode;
          mandate_ref?: string | null;
          latest_payment_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan_id?: string;
          status?: SubscriptionStatus;
          current_period_start?: string;
          current_period_end?: string;
          grace_period_end?: string;
          cancel_at_period_end?: boolean;
          billing_mode?: BillingMode;
          mandate_ref?: string | null;
          latest_payment_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_invoices: {
        Row: {
          id: string;
          subscription_id: string;
          user_id: string;
          plan_id: string;
          period_start: string;
          period_end: string;
          amount_minor: number;
          currency_code: string;
          status: 'pending' | 'paid' | 'void' | 'overdue';
          payment_id: string | null;
          due_at: string;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          subscription_id: string;
          user_id: string;
          plan_id: string;
          period_start: string;
          period_end: string;
          amount_minor: number;
          currency_code: string;
          status: 'pending' | 'paid' | 'void' | 'overdue';
          payment_id?: string | null;
          due_at: string;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          subscription_id?: string;
          user_id?: string;
          plan_id?: string;
          period_start?: string;
          period_end?: string;
          amount_minor?: number;
          currency_code?: string;
          status?: 'pending' | 'paid' | 'void' | 'overdue';
          payment_id?: string | null;
          due_at?: string;
          paid_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_invoices_subscription_id_fkey';
            columns: ['subscription_id'];
            referencedRelation: 'subscriptions';
            referencedColumns: ['id'];
          },
        ];
      };
      package_daily_stats: {
        Row: {
          package_id: string;
          date: string;
          impressions: number;
          views: number;
          proposal_starts: number;
        };
        Insert: {
          package_id: string;
          date?: string;
          impressions?: number;
          views?: number;
          proposal_starts?: number;
        };
        Update: {
          package_id?: string;
          date?: string;
          impressions?: number;
          views?: number;
          proposal_starts?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'package_daily_stats_package_id_fkey';
            columns: ['package_id'];
            referencedRelation: 'service_packages';
            referencedColumns: ['id'];
          },
        ];
      };
      promotion_daily_stats: {
        Row: {
          promotion_id: string;
          date: string;
          impressions: number;
          clicks: number;
        };
        Insert: {
          promotion_id: string;
          date?: string;
          impressions?: number;
          clicks?: number;
        };
        Update: {
          promotion_id?: string;
          date?: string;
          impressions?: number;
          clicks?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'promotion_daily_stats_promotion_id_fkey';
            columns: ['promotion_id'];
            referencedRelation: 'listing_promotions';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_audit_log: {
        Row: {
          id: string;
          actor_id: string;
          action: string;
          target_type: string;
          target_id: string;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id: string;
          action: string;
          target_type: string;
          target_id: string;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string;
          action?: string;
          target_type?: string;
          target_id?: string;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      public_provider_profiles: {
        Row: {
          id: string;
          display_name: string | null;
          business_name: string | null;
          avatar_url: string | null;
          city_id: string | null;
          area_id: string | null;
          member_since: string | null;
          reliability_score: number | null;
          reputation_tier: ReputationTier | null;
          completed_trades_count: number | null;
          distinct_partners_count: number | null;
          avg_overall_rating: number | null;
          would_trade_again_pct: number | null;
          avg_quality_rating: number | null;
          avg_communication_rating: number | null;
          avg_timeliness_rating: number | null;
          is_score_visible: boolean | null;
          verification_status: ProviderVerificationAggregateStatus | null;
          verified_link_count: number | null;
          verified_since: string | null;
        };
        Relationships: [];
      };
      public_verified_portfolio_links: {
        Row: {
          id: string;
          user_id: string;
          provider_key: string;
          canonical_url: string;
          handle: string | null;
          verified_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      publish_service_package: {
        Args: {
          p_package_id: string;
        };
        Returns: Json;
      };
      set_service_package_status: {
        Args: {
          p_package_id: string;
          p_status: PackageStatus;
        };
        Returns: Json;
      };
      delete_service_package: {
        Args: {
          p_package_id: string;
        };
        Returns: Json;
      };
      search_service_packages: {
        Args: {
          p_country_code: string;
          p_locale?: string;
          p_city_id?: string | null;
          p_area_id?: string | null;
          p_category_id?: string | null;
          p_seeking_category_id?: string | null;
          p_delivery_mode?: DeliveryMode | null;
          p_query?: string | null;
          p_cursor_published_at?: string | null;
          p_cursor_id?: string | null;
          p_page_size?: number;
        };
        Returns: {
          id: string;
          title: string;
          summary: string;
          category_id: string;
          category_slug: string;
          category_name: string;
          delivery_mode: DeliveryMode;
          country_code: string;
          city_id: string | null;
          city_name: string | null;
          area_id: string | null;
          area_name: string | null;
          turnaround_days: number;
          capacity_per_month: number | null;
          indicative_value_minor: number | null;
          currency_code: string;
          deliverables: Json;
          exclusions: Json;
          seeking_categories: Json;
          provider_id: string;
          provider_display_name: string | null;
          provider_business_name: string | null;
          provider_avatar_url: string | null;
          provider_member_since: string | null;
          published_at: string;
          has_next_page: boolean;
          is_promoted: boolean;
          promoted_slot: number | null;
          rank_ts: string;
        }[];
      };
      get_entitlements: {
        Args: {
          p_user_id: string;
        };
        Returns: Json;
      };
      is_finance_or_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      sync_provider_rank_ts: {
        Args: {
          p_user_id: string;
        };
        Returns: undefined;
      };
      settle_payment_transaction: {
        Args: {
          p_payment_id: string;
          p_checkout_request_id: string;
          p_receipt_number: string;
          p_verified_amount_minor: number;
          p_note?: string | null;
        };
        Returns: Json;
      };
      fail_payment_transaction: {
        Args: {
          p_payment_id: string;
          p_failure_code: string;
          p_failure_reason: string;
          p_terminal_status?: PaymentStatus;
        };
        Returns: Json;
      };
      propose_agreement: {
        Args: {
          p_recipient_id: string;
          p_proposer_lines: Json;
          p_recipient_lines: Json;
          p_note?: string | null;
          p_consented_channels?: string[];
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      counter_agreement: {
        Args: {
          p_agreement_id: string;
          p_expected_revision_no: number;
          p_proposer_lines: Json;
          p_recipient_lines: Json;
          p_note?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      accept_agreement: {
        Args: {
          p_agreement_id: string;
          p_expected_revision_no: number;
          p_consented_channels?: string[];
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      decline_agreement: {
        Args: {
          p_agreement_id: string;
          p_expected_revision_no: number;
          p_reason?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      withdraw_agreement: {
        Args: {
          p_agreement_id: string;
          p_expected_revision_no: number;
          p_reason?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      mark_delivered: {
        Args: {
          p_agreement_id: string;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      confirm_receipt: {
        Args: {
          p_agreement_id: string;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      request_cancellation: {
        Args: {
          p_agreement_id: string;
          p_reason: string;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      accept_cancellation: {
        Args: {
          p_agreement_id: string;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      open_dispute: {
        Args: {
          p_agreement_id: string;
          p_reason: string;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      get_counterparty_contact: {
        Args: {
          p_agreement_id: string;
        };
        Returns: Json;
      };
      mark_notifications_read: {
        Args: {
          p_notification_ids?: string[] | null;
        };
        Returns: Json;
      };
      suggest_mutual_matches: {
        Args: {
          p_limit?: number;
          p_cursor_score?: number | null;
          p_cursor_user_id?: string | null;
        };
        Returns: {
          counterparty_id: string;
          display_name: string | null;
          business_name: string | null;
          avatar_url: string | null;
          city_name: string | null;
          area_name: string | null;
          match_strength: number;
          my_matching_packages: Json;
          their_matching_packages: Json;
        }[];
      };
      submit_review: {
        Args: {
          p_agreement_id: string;
          p_overall_rating: number;
          p_quality_rating: number;
          p_communication_rating: number;
          p_timeliness_rating: number;
          p_would_trade_again: boolean;
          p_review_text?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      edit_review: {
        Args: {
          p_review_id: string;
          p_overall_rating: number;
          p_quality_rating: number;
          p_communication_rating: number;
          p_timeliness_rating: number;
          p_would_trade_again: boolean;
          p_review_text?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      withdraw_review: {
        Args: {
          p_review_id: string;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      reply_to_review: {
        Args: {
          p_review_id: string;
          p_reply_text: string;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      report_review: {
        Args: {
          p_review_id: string;
          p_reason: ReportReason;
          p_details?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      moderate_review: {
        Args: {
          p_review_id: string;
          p_action: string;
          p_reason: string;
        };
        Returns: Json;
      };
      recompute_provider_reputation: {
        Args: {
          p_provider_id: string;
        };
        Returns: Json;
      };
      dispatch_domain_events: {
        Args: {
          p_batch_size?: number;
        };
        Returns: Json;
      };
      check_review_windows_and_reveal: {
        Args: Record<string, never>;
        Returns: Json;
      };
      recompute_provider_verification: {
        Args: {
          p_provider_id: string;
        };
        Returns: Json;
      };
      create_portfolio_link: {
        Args: {
          p_provider_key: string;
          p_url: string;
          p_canonical_url: string;
          p_method: VerificationMethod;
          p_handle?: string | null;
          p_challenge_code?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      submit_manual_evidence: {
        Args: {
          p_link_id: string;
          p_evidence_asset_id: string;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      admin_review_link: {
        Args: {
          p_link_id: string;
          p_action: string;
          p_reject_reason?: string | null;
          p_reject_note?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      admin_revoke_link: {
        Args: {
          p_link_id: string;
          p_reason: string;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      system_pause_packages_for_unverified: {
        Args: {
          p_user_id: string;
          p_reason?: string;
        };
        Returns: Json;
      };
      grant_verifier_role: {
        Args: {
          p_user_email: string;
        };
        Returns: Json;
      };
      record_package_analytics: {
        Args: {
          p_package_id: string;
          p_impressions?: number;
          p_views?: number;
          p_proposal_starts?: number;
        };
        Returns: undefined;
      };
      record_promotion_analytics: {
        Args: {
          p_promotion_id: string;
          p_impressions?: number;
          p_clicks?: number;
        };
        Returns: undefined;
      };
      admin_record_refund: {
        Args: {
          p_payment_id: string;
          p_actor_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      get_revenue_metrics: {
        Args: {
          p_actor_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      account_type: AccountType;
      app_role: AppRole;
      location_level: LocationLevel;
      package_status: PackageStatus;
      delivery_mode: DeliveryMode;
      agreement_status: AgreementStatus;
      agreement_side: AgreementSide;
      contact_channel: ContactChannel;
      review_status: ReviewStatus;
      report_reason: ReportReason;
      report_status: ReportStatus;
      reputation_tier: ReputationTier;
      verification_method: VerificationMethod;
      verification_status: VerificationStatus;
      provider_verification_aggregate_status: ProviderVerificationAggregateStatus;
      media_kind: MediaKind;
      media_status: MediaStatus;
      publish_gate_mode: PublishGateMode;
      payment_provider_code: PaymentProviderCode;
      payment_status: PaymentStatus;
      payment_purpose: PaymentPurpose;
      ledger_entry_type: LedgerEntryType;
      promotion_status: PromotionStatus;
      subscription_status: SubscriptionStatus;
      billing_mode: BillingMode;
    };
  };
}
