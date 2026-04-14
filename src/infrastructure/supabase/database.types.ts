export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1';
  };
  public: {
    Tables: {
      ab_events: {
        Row: {
          anonymous_id: string | null;
          created_at: string | null;
          event: string;
          experiment: string;
          id: string;
          metadata: Json | null;
          user_id: string | null;
          variant: string;
        };
        Insert: {
          anonymous_id?: string | null;
          created_at?: string | null;
          event: string;
          experiment: string;
          id?: string;
          metadata?: Json | null;
          user_id?: string | null;
          variant: string;
        };
        Update: {
          anonymous_id?: string | null;
          created_at?: string | null;
          event?: string;
          experiment?: string;
          id?: string;
          metadata?: Json | null;
          user_id?: string | null;
          variant?: string;
        };
        Relationships: [];
      };
      argument_categories: {
        Row: {
          code: string;
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          parent_id: string | null;
          sentiment_direction: string | null;
          sort_order: number | null;
        };
        Insert: {
          code: string;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          parent_id?: string | null;
          sentiment_direction?: string | null;
          sort_order?: number | null;
        };
        Update: {
          code?: string;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          parent_id?: string | null;
          sentiment_direction?: string | null;
          sort_order?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'argument_categories_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'argument_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      bookmarks: {
        Row: {
          created_at: string | null;
          id: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bookmarks_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookmarks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      content_unlocks: {
        Row: {
          credits_paid: number;
          id: string;
          target_key: string;
          unlock_type: string;
          unlocked_at: string;
          user_id: string;
        };
        Insert: {
          credits_paid?: number;
          id?: string;
          target_key: string;
          unlock_type: string;
          unlocked_at?: string;
          user_id: string;
        };
        Update: {
          credits_paid?: number;
          id?: string;
          target_key?: string;
          unlock_type?: string;
          unlocked_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      drafts: {
        Row: {
          ai_arguments: Json | null;
          content: string | null;
          created_at: string | null;
          id: string;
          images: string[] | null;
          kol_id: string | null;
          kol_name_input: string | null;
          posted_at: string | null;
          sentiment: number | null;
          source_url: string | null;
          stock_ids: string[] | null;
          stock_name_inputs: string[] | null;
          stock_sentiments: Json | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          ai_arguments?: Json | null;
          content?: string | null;
          created_at?: string | null;
          id?: string;
          images?: string[] | null;
          kol_id?: string | null;
          kol_name_input?: string | null;
          posted_at?: string | null;
          sentiment?: number | null;
          source_url?: string | null;
          stock_ids?: string[] | null;
          stock_name_inputs?: string[] | null;
          stock_sentiments?: Json | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          ai_arguments?: Json | null;
          content?: string | null;
          created_at?: string | null;
          id?: string;
          images?: string[] | null;
          kol_id?: string | null;
          kol_name_input?: string | null;
          posted_at?: string | null;
          sentiment?: number | null;
          source_url?: string | null;
          stock_ids?: string[] | null;
          stock_name_inputs?: string[] | null;
          stock_sentiments?: Json | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'drafts_kol_id_fkey';
            columns: ['kol_id'];
            isOneToOne: false;
            referencedRelation: 'kol_stats';
            referencedColumns: ['kol_id'];
          },
          {
            foreignKeyName: 'drafts_kol_id_fkey';
            columns: ['kol_id'];
            isOneToOne: false;
            referencedRelation: 'kols';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'drafts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      kol_sources: {
        Row: {
          created_at: string;
          id: string;
          kol_id: string;
          last_scraped_at: string | null;
          monitor_frequency_hours: number;
          monitoring_enabled: boolean;
          next_check_at: string | null;
          platform: string;
          platform_id: string;
          platform_url: string;
          posts_scraped_count: number;
          scrape_status: string;
          source: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kol_id: string;
          last_scraped_at?: string | null;
          monitor_frequency_hours?: number;
          monitoring_enabled?: boolean;
          next_check_at?: string | null;
          platform: string;
          platform_id: string;
          platform_url: string;
          posts_scraped_count?: number;
          scrape_status?: string;
          source?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kol_id?: string;
          last_scraped_at?: string | null;
          monitor_frequency_hours?: number;
          monitoring_enabled?: boolean;
          next_check_at?: string | null;
          platform?: string;
          platform_id?: string;
          platform_url?: string;
          posts_scraped_count?: number;
          scrape_status?: string;
          source?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'kol_sources_kol_id_fkey';
            columns: ['kol_id'];
            isOneToOne: false;
            referencedRelation: 'kol_stats';
            referencedColumns: ['kol_id'];
          },
          {
            foreignKeyName: 'kol_sources_kol_id_fkey';
            columns: ['kol_id'];
            isOneToOne: false;
            referencedRelation: 'kols';
            referencedColumns: ['id'];
          },
        ];
      };
      kol_subscriptions: {
        Row: {
          created_at: string;
          id: string;
          kol_source_id: string;
          notify_new_posts: boolean;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kol_source_id: string;
          notify_new_posts?: boolean;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kol_source_id?: string;
          notify_new_posts?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'kol_subscriptions_kol_source_id_fkey';
            columns: ['kol_source_id'];
            isOneToOne: false;
            referencedRelation: 'kol_sources';
            referencedColumns: ['id'];
          },
        ];
      };
      kols: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string | null;
          created_by: string | null;
          id: string;
          name: string;
          slug: string;
          social_links: Json | null;
          updated_at: string | null;
          validated_at: string | null;
          validated_by: string | null;
          validation_score: Json | null;
          validation_status: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          name: string;
          slug: string;
          social_links?: Json | null;
          updated_at?: string | null;
          validated_at?: string | null;
          validated_by?: string | null;
          validation_score?: Json | null;
          validation_status?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          name?: string;
          slug?: string;
          social_links?: Json | null;
          updated_at?: string | null;
          validated_at?: string | null;
          validated_by?: string | null;
          validation_score?: Json | null;
          validation_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'kols_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      post_arguments: {
        Row: {
          category_id: string;
          confidence: number | null;
          created_at: string | null;
          id: string;
          original_text: string | null;
          post_id: string;
          sentiment: number;
          statement_type: string | null;
          stock_id: string;
          summary: string | null;
        };
        Insert: {
          category_id: string;
          confidence?: number | null;
          created_at?: string | null;
          id?: string;
          original_text?: string | null;
          post_id: string;
          sentiment: number;
          statement_type?: string | null;
          stock_id: string;
          summary?: string | null;
        };
        Update: {
          category_id?: string;
          confidence?: number | null;
          created_at?: string | null;
          id?: string;
          original_text?: string | null;
          post_id?: string;
          sentiment?: number;
          statement_type?: string | null;
          stock_id?: string;
          summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'post_arguments_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'argument_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_arguments_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_arguments_stock_id_fkey';
            columns: ['stock_id'];
            isOneToOne: false;
            referencedRelation: 'stock_stats';
            referencedColumns: ['stock_id'];
          },
          {
            foreignKeyName: 'post_arguments_stock_id_fkey';
            columns: ['stock_id'];
            isOneToOne: false;
            referencedRelation: 'stocks';
            referencedColumns: ['id'];
          },
        ];
      };
      post_stocks: {
        Row: {
          id: string;
          inference_reason: string | null;
          post_id: string;
          sentiment: number | null;
          source: string;
          stock_id: string;
        };
        Insert: {
          id?: string;
          inference_reason?: string | null;
          post_id: string;
          sentiment?: number | null;
          source?: string;
          stock_id: string;
        };
        Update: {
          id?: string;
          inference_reason?: string | null;
          post_id?: string;
          sentiment?: number | null;
          source?: string;
          stock_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_stocks_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_stocks_stock_id_fkey';
            columns: ['stock_id'];
            isOneToOne: false;
            referencedRelation: 'stock_stats';
            referencedColumns: ['stock_id'];
          },
          {
            foreignKeyName: 'post_stocks_stock_id_fkey';
            columns: ['stock_id'];
            isOneToOne: false;
            referencedRelation: 'stocks';
            referencedColumns: ['id'];
          },
        ];
      };
      post_win_rate_samples: {
        Row: {
          classifier_version: number;
          computed_at: string;
          excess_return: number | null;
          outcome: string;
          period_days: number;
          post_id: string;
          stock_id: string;
          threshold_source: string | null;
          threshold_value: number | null;
        };
        Insert: {
          classifier_version?: number;
          computed_at?: string;
          excess_return?: number | null;
          outcome: string;
          period_days: number;
          post_id: string;
          stock_id: string;
          threshold_source?: string | null;
          threshold_value?: number | null;
        };
        Update: {
          classifier_version?: number;
          computed_at?: string;
          excess_return?: number | null;
          outcome?: string;
          period_days?: number;
          post_id?: string;
          stock_id?: string;
          threshold_source?: string | null;
          threshold_value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'post_win_rate_samples_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_win_rate_samples_stock_id_fkey';
            columns: ['stock_id'];
            isOneToOne: false;
            referencedRelation: 'stock_stats';
            referencedColumns: ['stock_id'];
          },
          {
            foreignKeyName: 'post_win_rate_samples_stock_id_fkey';
            columns: ['stock_id'];
            isOneToOne: false;
            referencedRelation: 'stocks';
            referencedColumns: ['id'];
          },
        ];
      };
      posts: {
        Row: {
          ai_model_version: string | null;
          content: string;
          content_fingerprint: string | null;
          created_at: string | null;
          created_by: string | null;
          id: string;
          images: string[] | null;
          kol_id: string;
          posted_at: string;
          primary_post_id: string | null;
          sentiment: number;
          sentiment_ai_generated: boolean | null;
          source: string | null;
          source_platform: string | null;
          source_url: string | null;
          title: string | null;
          updated_at: string | null;
        };
        Insert: {
          ai_model_version?: string | null;
          content: string;
          content_fingerprint?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          images?: string[] | null;
          kol_id: string;
          posted_at: string;
          primary_post_id?: string | null;
          sentiment: number;
          sentiment_ai_generated?: boolean | null;
          source?: string | null;
          source_platform?: string | null;
          source_url?: string | null;
          title?: string | null;
          updated_at?: string | null;
        };
        Update: {
          ai_model_version?: string | null;
          content?: string;
          content_fingerprint?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          images?: string[] | null;
          kol_id?: string;
          posted_at?: string;
          primary_post_id?: string | null;
          sentiment?: number;
          sentiment_ai_generated?: boolean | null;
          source?: string | null;
          source_platform?: string | null;
          source_url?: string | null;
          title?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'posts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'posts_kol_id_fkey';
            columns: ['kol_id'];
            isOneToOne: false;
            referencedRelation: 'kol_stats';
            referencedColumns: ['kol_id'];
          },
          {
            foreignKeyName: 'posts_kol_id_fkey';
            columns: ['kol_id'];
            isOneToOne: false;
            referencedRelation: 'kols';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'posts_primary_post_id_fkey';
            columns: ['primary_post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          color_palette: string | null;
          created_at: string | null;
          credit_balance: number | null;
          credit_reset_at: string | null;
          default_win_rate_period: string;
          display_name: string | null;
          first_import_free: boolean | null;
          id: string;
          posts_last_viewed_at: string | null;
          status: string;
          subscription_tier: string | null;
          timezone: string | null;
          updated_at: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          color_palette?: string | null;
          created_at?: string | null;
          credit_balance?: number | null;
          credit_reset_at?: string | null;
          default_win_rate_period?: string;
          display_name?: string | null;
          first_import_free?: boolean | null;
          id?: string;
          posts_last_viewed_at?: string | null;
          status?: string;
          subscription_tier?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          color_palette?: string | null;
          created_at?: string | null;
          credit_balance?: number | null;
          credit_reset_at?: string | null;
          default_win_rate_period?: string;
          display_name?: string | null;
          first_import_free?: boolean | null;
          id?: string;
          posts_last_viewed_at?: string | null;
          status?: string;
          subscription_tier?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      scrape_jobs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          discovered_urls: Json;
          duplicate_count: number;
          error_count: number;
          error_message: string | null;
          filtered_count: number;
          id: string;
          imported_count: number;
          job_type: string;
          kol_source_id: string;
          processed_urls: number;
          retry_count: number;
          started_at: string | null;
          status: string;
          total_urls: number;
          triggered_by: string | null;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          discovered_urls?: Json;
          duplicate_count?: number;
          error_count?: number;
          error_message?: string | null;
          filtered_count?: number;
          id?: string;
          imported_count?: number;
          job_type: string;
          kol_source_id: string;
          processed_urls?: number;
          retry_count?: number;
          started_at?: string | null;
          status?: string;
          total_urls?: number;
          triggered_by?: string | null;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          discovered_urls?: Json;
          duplicate_count?: number;
          error_count?: number;
          error_message?: string | null;
          filtered_count?: number;
          id?: string;
          imported_count?: number;
          job_type?: string;
          kol_source_id?: string;
          processed_urls?: number;
          retry_count?: number;
          started_at?: string | null;
          status?: string;
          total_urls?: number;
          triggered_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'scrape_jobs_kol_source_id_fkey';
            columns: ['kol_source_id'];
            isOneToOne: false;
            referencedRelation: 'kol_sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'scrape_jobs_triggered_by_fkey';
            columns: ['triggered_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_prices: {
        Row: {
          close: number;
          date: string;
          fetched_at: string | null;
          high: number | null;
          id: string;
          low: number | null;
          open: number | null;
          stock_id: string;
          volume: number | null;
        };
        Insert: {
          close: number;
          date: string;
          fetched_at?: string | null;
          high?: number | null;
          id?: string;
          low?: number | null;
          open?: number | null;
          stock_id: string;
          volume?: number | null;
        };
        Update: {
          close?: number;
          date?: string;
          fetched_at?: string | null;
          high?: number | null;
          id?: string;
          low?: number | null;
          open?: number | null;
          stock_id?: string;
          volume?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_prices_stock_id_fkey';
            columns: ['stock_id'];
            isOneToOne: false;
            referencedRelation: 'stock_stats';
            referencedColumns: ['stock_id'];
          },
          {
            foreignKeyName: 'stock_prices_stock_id_fkey';
            columns: ['stock_id'];
            isOneToOne: false;
            referencedRelation: 'stocks';
            referencedColumns: ['id'];
          },
        ];
      };
      stocks: {
        Row: {
          created_at: string | null;
          id: string;
          logo_url: string | null;
          market: string | null;
          name: string;
          ticker: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          logo_url?: string | null;
          market?: string | null;
          name: string;
          ticker: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          logo_url?: string | null;
          market?: string | null;
          name?: string;
          ticker?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      transcripts: {
        Row: {
          content: string;
          created_at: string | null;
          duration_seconds: number | null;
          id: string;
          language: string | null;
          source: string;
          source_url: string;
        };
        Insert: {
          content: string;
          created_at?: string | null;
          duration_seconds?: number | null;
          id?: string;
          language?: string | null;
          source: string;
          source_url: string;
        };
        Update: {
          content?: string;
          created_at?: string | null;
          duration_seconds?: number | null;
          id?: string;
          language?: string | null;
          source?: string;
          source_url?: string;
        };
        Relationships: [];
      };
      volatility_thresholds: {
        Row: {
          as_of_date: string;
          computed_at: string;
          period_days: number;
          sample_size: number;
          source: string;
          ticker: string;
          value: number;
        };
        Insert: {
          as_of_date: string;
          computed_at?: string;
          period_days: number;
          sample_size: number;
          source: string;
          ticker: string;
          value: number;
        };
        Update: {
          as_of_date?: string;
          computed_at?: string;
          period_days?: number;
          sample_size?: number;
          source?: string;
          ticker?: string;
          value?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      kol_stats: {
        Row: {
          kol_id: string | null;
          last_post_at: string | null;
          post_count: number | null;
        };
        Relationships: [];
      };
      stock_stats: {
        Row: {
          last_post_at: string | null;
          post_count: number | null;
          stock_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      consume_credits: {
        Args: { p_amount: number; p_operation?: string; p_user_id: string };
        Returns: Json;
      };
      create_post_atomic:
        | {
            Args: {
              p_arguments?: Json;
              p_content: string;
              p_created_by: string;
              p_images: string[];
              p_kol_id: string;
              p_posted_at: string;
              p_sentiment: number;
              p_sentiment_ai_generated: boolean;
              p_source_platform: string;
              p_source_url: string;
              p_stocks?: Json;
              p_title: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_ai_model_version?: string;
              p_arguments?: Json;
              p_content: string;
              p_created_by: string;
              p_images: string[];
              p_kol_id: string;
              p_posted_at: string;
              p_sentiment: number;
              p_sentiment_ai_generated: boolean;
              p_source_platform: string;
              p_source_url: string;
              p_stocks?: Json;
              p_title: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_ai_model_version?: string;
              p_arguments?: Json;
              p_content: string;
              p_content_fingerprint?: string;
              p_created_by: string;
              p_images: string[];
              p_kol_id: string;
              p_posted_at: string;
              p_sentiment: number;
              p_sentiment_ai_generated: boolean;
              p_source_platform: string;
              p_source_url: string;
              p_stocks?: Json;
              p_title: string;
            };
            Returns: Json;
          };
      delete_post_and_promote_mirror: {
        Args: { p_post_id: string };
        Returns: undefined;
      };
      get_kol_follower_count: { Args: { p_kol_id: string }; Returns: number };
      get_popular_kols: {
        Args: { p_limit?: number };
        Returns: {
          avatar_url: string;
          follower_count: number;
          kol_id: string;
          name: string;
        }[];
      };
      get_trending_stocks: {
        Args: { p_days?: number; p_limit?: number };
        Returns: {
          name: string;
          post_count: number;
          stock_id: string;
          ticker: string;
        }[];
      };
      refund_credits: {
        Args: { p_amount: number; p_user_id: string };
        Returns: Json;
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
