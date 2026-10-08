export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type LocationLevel = 'region' | 'city' | 'area';
export type AccountType = 'freelancer' | 'business';
export type AppRole = 'user' | 'admin' | 'support';
export type PackageStatus = 'draft' | 'published' | 'paused' | 'archived' | 'removed';
export type DeliveryMode = 'in_person' | 'remote' | 'hybrid';

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
        }[];
      };
    };
    Enums: {
      account_type: AccountType;
      app_role: AppRole;
      location_level: LocationLevel;
      package_status: PackageStatus;
      delivery_mode: DeliveryMode;
    };
  };
}
