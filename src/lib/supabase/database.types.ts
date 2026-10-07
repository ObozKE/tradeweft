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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      account_type: AccountType;
      app_role: AppRole;
      location_level: LocationLevel;
    };
  };
}
