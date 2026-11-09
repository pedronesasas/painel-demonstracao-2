export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      board_column_kinds: {
        Row: {
          created_at: string
          id: string
          is_done: boolean
          is_paused: boolean
          is_system: boolean
          label: string
          sort: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_done?: boolean
          is_paused?: boolean
          is_system?: boolean
          label: string
          sort?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_done?: boolean
          is_paused?: boolean
          is_system?: boolean
          label?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      board_columns: {
        Row: {
          board_id: string
          color: string
          created_at: string
          id: string
          is_done_column: boolean
          is_paused_column: boolean
          kind_id: string | null
          name: string
          position: number
          wip_limit: number | null
        }
        Insert: {
          board_id: string
          color?: string
          created_at?: string
          id?: string
          is_done_column?: boolean
          is_paused_column?: boolean
          kind_id?: string | null
          name: string
          position?: number
          wip_limit?: number | null
        }
        Update: {
          board_id?: string
          color?: string
          created_at?: string
          id?: string
          is_done_column?: boolean
          is_paused_column?: boolean
          kind_id?: string | null
          name?: string
          position?: number
          wip_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "board_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_columns_kind_id_fkey"
            columns: ["kind_id"]
            isOneToOne: false
            referencedRelation: "board_column_kinds"
            referencedColumns: ["id"]
          },
        ]
      }
      board_profile_access: {
        Row: {
          board_id: string
          created_at: string
          profile_id: string
        }
        Insert: {
          board_id: string
          created_at?: string
          profile_id: string
        }
        Update: {
          board_id?: string
          created_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_profile_access_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_profile_access_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      board_user_access: {
        Row: {
          access: string
          board_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          access: string
          board_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          access?: string
          board_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_user_access_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          position: number
          short_prefix: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          position?: number
          short_prefix?: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          position?: number
          short_prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          campaign_id: string | null
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          end_at: string | null
          id: string
          start_at: string
          title: string
          type: Database["public"]["Enums"]["calendar_event_type"]
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string | null
          id?: string
          start_at: string
          title: string
          type?: Database["public"]["Enums"]["calendar_event_type"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string | null
          id?: string
          start_at?: string
          title?: string
          type?: Database["public"]["Enums"]["calendar_event_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          language_id: string | null
          notes: string | null
          product_name: string
          start_date: string | null
          status: string
          updated_at: string
          week_number: number
          year: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          language_id?: string | null
          notes?: string | null
          product_name: string
          start_date?: string | null
          status?: string
          updated_at?: string
          week_number: number
          year: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          language_id?: string | null
          notes?: string | null
          product_name?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          week_number?: number
          year?: number
        }
        Relationships: []
      }
      card_activity: {
        Row: {
          action: string
          actor_id: string | null
          card_id: string
          created_at: string
          field: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          card_id: string
          created_at?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          card_id?: string
          created_at?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "card_activity_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_metrics"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_activity_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_assignees: {
        Row: {
          card_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_assignees_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_metrics"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_assignees_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      card_comment_mentions: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "card_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      card_comments: {
        Row: {
          author_id: string
          body: string
          card_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          card_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          card_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_comments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_metrics"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_comments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_field_values: {
        Row: {
          card_id: string
          field_id: string
          id: string
          value: string | null
        }
        Insert: {
          card_id: string
          field_id: string
          id?: string
          value?: string | null
        }
        Update: {
          card_id?: string
          field_id?: string
          id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_field_values_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_metrics"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_field_values_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      card_subitem_assignees: {
        Row: {
          created_at: string
          subitem_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          subitem_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          subitem_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_subitem_assignees_subitem_id_fkey"
            columns: ["subitem_id"]
            isOneToOne: false
            referencedRelation: "card_subitems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_subitem_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      card_subitems: {
        Row: {
          assignee_id: string | null
          blocks_parent: boolean
          card_id: string
          created_at: string
          description: string | null
          done: boolean
          due_date: string | null
          id: string
          position: number
          promoted_board_id: string | null
          promoted_card_id: string | null
          title: string
        }
        Insert: {
          assignee_id?: string | null
          blocks_parent?: boolean
          card_id: string
          created_at?: string
          description?: string | null
          done?: boolean
          due_date?: string | null
          id?: string
          position?: number
          promoted_board_id?: string | null
          promoted_card_id?: string | null
          title: string
        }
        Update: {
          assignee_id?: string | null
          blocks_parent?: boolean
          card_id?: string
          created_at?: string
          description?: string | null
          done?: boolean
          due_date?: string | null
          id?: string
          position?: number
          promoted_board_id?: string | null
          promoted_card_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_subitems_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_metrics"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_subitems_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_subitems_promoted_board_fk"
            columns: ["promoted_board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_subitems_promoted_card_fk"
            columns: ["promoted_card_id"]
            isOneToOne: false
            referencedRelation: "card_metrics"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_subitems_promoted_card_fk"
            columns: ["promoted_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_tags: {
        Row: {
          card_id: string
          tag_id: string
        }
        Insert: {
          card_id: string
          tag_id: string
        }
        Update: {
          card_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_tags_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_metrics"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_tags_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          assignee_id: string | null
          board_id: string
          column_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: Json | null
          due_date: string | null
          end_date: string | null
          id: string
          position: number
          priority: Database["public"]["Enums"]["card_priority"]
          recurrence: Json | null
          recurrence_template_id: string | null
          short_id: string | null
          source_subitem_id: string | null
          squad_id: string | null
          start_date: string | null
          title: string
          updated_at: string
          visible_in_calendar: boolean
        }
        Insert: {
          assignee_id?: string | null
          board_id: string
          column_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: Json | null
          due_date?: string | null
          end_date?: string | null
          id?: string
          position?: number
          priority?: Database["public"]["Enums"]["card_priority"]
          recurrence?: Json | null
          recurrence_template_id?: string | null
          short_id?: string | null
          source_subitem_id?: string | null
          squad_id?: string | null
          start_date?: string | null
          title: string
          updated_at?: string
          visible_in_calendar?: boolean
        }
        Update: {
          assignee_id?: string | null
          board_id?: string
          column_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: Json | null
          due_date?: string | null
          end_date?: string | null
          id?: string
          position?: number
          priority?: Database["public"]["Enums"]["card_priority"]
          recurrence?: Json | null
          recurrence_template_id?: string | null
          short_id?: string | null
          source_subitem_id?: string | null
          squad_id?: string | null
          start_date?: string | null
          title?: string
          updated_at?: string
          visible_in_calendar?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cards_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "board_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_recurrence_template_id_fkey"
            columns: ["recurrence_template_id"]
            isOneToOne: false
            referencedRelation: "card_metrics"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "cards_recurrence_template_id_fkey"
            columns: ["recurrence_template_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_source_subitem_fk"
            columns: ["source_subitem_id"]
            isOneToOne: false
            referencedRelation: "card_subitems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          board_id: string | null
          created_at: string
          id: string
          name: string
          options: Json | null
          position: number
          type: Database["public"]["Enums"]["custom_field_type"]
        }
        Insert: {
          board_id?: string | null
          created_at?: string
          id?: string
          name: string
          options?: Json | null
          position?: number
          type: Database["public"]["Enums"]["custom_field_type"]
        }
        Update: {
          board_id?: string | null
          created_at?: string
          id?: string
          name?: string
          options?: Json | null
          position?: number
          type?: Database["public"]["Enums"]["custom_field_type"]
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string
          id: string
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding: string
          id?: string
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string
          id?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: Json | null
          cover_color: string | null
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          indexed_at: string | null
          parent_id: string | null
          position: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: Json | null
          cover_color?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          indexed_at?: string | null
          parent_id?: string | null
          position?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json | null
          cover_color?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          indexed_at?: string | null
          parent_id?: string | null
          position?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_weekly_targets: {
        Row: {
          created_at: string
          editor_id: string
          extra_minute_rate_cents: number
          id: string
          updated_at: string
          weekly_target_minutes: number
        }
        Insert: {
          created_at?: string
          editor_id: string
          extra_minute_rate_cents?: number
          id?: string
          updated_at?: string
          weekly_target_minutes?: number
        }
        Update: {
          created_at?: string
          editor_id?: string
          extra_minute_rate_cents?: number
          id?: string
          updated_at?: string
          weekly_target_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "editor_weekly_targets_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          bounced_count: number
          campaign_id: string
          clicked_count: number
          clicked_human_count: number
          complaints_count: number
          created_at: string
          getresponse_id: string | null
          id: string
          opened_count: number
          opened_human_count: number
          phase: string
          revenue: number
          sales_count: number
          sent_at: string | null
          sent_count: number
          subject: string
          unsubscribed_count: number
        }
        Insert: {
          bounced_count?: number
          campaign_id: string
          clicked_count?: number
          clicked_human_count?: number
          complaints_count?: number
          created_at?: string
          getresponse_id?: string | null
          id?: string
          opened_count?: number
          opened_human_count?: number
          phase: string
          revenue?: number
          sales_count?: number
          sent_at?: string | null
          sent_count?: number
          subject: string
          unsubscribed_count?: number
        }
        Update: {
          bounced_count?: number
          campaign_id?: string
          clicked_count?: number
          clicked_human_count?: number
          complaints_count?: number
          created_at?: string
          getresponse_id?: string | null
          id?: string
          opened_count?: number
          opened_human_count?: number
          phase?: string
          revenue?: number
          sales_count?: number
          sent_at?: string | null
          sent_count?: number
          subject?: string
          unsubscribed_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "emails_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_sales: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          customer_email: string | null
          event_type: string
          id: string
          occurred_at: string
          offer_id: string | null
          offer_region_id: string | null
          platform: string
          product_name: string | null
          raw: Json | null
          region: Database["public"]["Enums"]["offer_region"]
          transaction_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          offer_id?: string | null
          offer_region_id?: string | null
          platform?: string
          product_name?: string | null
          raw?: Json | null
          region?: Database["public"]["Enums"]["offer_region"]
          transaction_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          offer_id?: string | null
          offer_region_id?: string | null
          platform?: string
          product_name?: string | null
          raw?: Json | null
          region?: Database["public"]["Enums"]["offer_region"]
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_sales_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_sales_offer_region_id_fkey"
            columns: ["offer_region_id"]
            isOneToOne: false
            referencedRelation: "offer_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          active: boolean
          code: string
          created_at: string
          currency: string
          flag: string | null
          id: string
          name: string
          position: number
          region: Database["public"]["Enums"]["offer_region"] | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          currency?: string
          flag?: string | null
          id?: string
          name: string
          position?: number
          region?: Database["public"]["Enums"]["offer_region"] | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          currency?: string
          flag?: string | null
          id?: string
          name?: string
          position?: number
          region?: Database["public"]["Enums"]["offer_region"] | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          card_id: string | null
          comment_id: string | null
          created_at: string
          id: string
          read_at: string | null
          subitem_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          card_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          subitem_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          card_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          subitem_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_metrics"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "notifications_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "card_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_subitem_id_fkey"
            columns: ["subitem_id"]
            isOneToOne: false
            referencedRelation: "card_subitems"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_region_checkouts: {
        Row: {
          checkout_url: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          external_id: string
          funnel_item_key: string | null
          id: string
          id_kind: string | null
          label: string | null
          offer_region_id: string
          page_url: string | null
          platform: string
          price: number | null
          product_code: string | null
        }
        Insert: {
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          external_id: string
          funnel_item_key?: string | null
          id?: string
          id_kind?: string | null
          label?: string | null
          offer_region_id: string
          page_url?: string | null
          platform?: string
          price?: number | null
          product_code?: string | null
        }
        Update: {
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          external_id?: string
          funnel_item_key?: string | null
          id?: string
          id_kind?: string | null
          label?: string | null
          offer_region_id?: string
          page_url?: string | null
          platform?: string
          price?: number | null
          product_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_region_checkouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_region_checkouts_offer_region_id_fkey"
            columns: ["offer_region_id"]
            isOneToOne: false
            referencedRelation: "offer_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_region_updates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          message: string
          offer_region_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          offer_region_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          offer_region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_region_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_region_updates_offer_region_id_fkey"
            columns: ["offer_region_id"]
            isOneToOne: false
            referencedRelation: "offer_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_regions: {
        Row: {
          active: boolean
          channel: Database["public"]["Enums"]["offer_channel"]
          created_at: string
          deliverable_url: string | null
          description: Json | null
          funnel_items: Json
          id: string
          offer_id: string
          position: number
          product_id: string | null
          region: Database["public"]["Enums"]["offer_region"]
          stage: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel?: Database["public"]["Enums"]["offer_channel"]
          created_at?: string
          deliverable_url?: string | null
          description?: Json | null
          funnel_items?: Json
          id?: string
          offer_id: string
          position?: number
          product_id?: string | null
          region: Database["public"]["Enums"]["offer_region"]
          stage?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel?: Database["public"]["Enums"]["offer_channel"]
          created_at?: string
          deliverable_url?: string | null
          description?: Json | null
          funnel_items?: Json
          id?: string
          offer_id?: string
          position?: number
          product_id?: string | null
          region?: Database["public"]["Enums"]["offer_region"]
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_regions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_regions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_tests: {
        Row: {
          conclusion: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          hypothesis: string | null
          id: string
          name: string
          offer_id: string
          result: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["offer_test_status"]
          updated_at: string
        }
        Insert: {
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          hypothesis?: string | null
          id?: string
          name: string
          offer_id: string
          result?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["offer_test_status"]
          updated_at?: string
        }
        Update: {
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          hypothesis?: string | null
          id?: string
          name?: string
          offer_id?: string
          result?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["offer_test_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_tests_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          created_at: string
          created_by: string | null
          description: Json | null
          id: string
          name: string
          position: number
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: Json | null
          id?: string
          name: string
          position?: number
          stage?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: Json | null
          id?: string
          name?: string
          position?: number
          stage?: string
          updated_at?: string
        }
        Relationships: []
      }
      permission_profiles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_localizations: {
        Row: {
          created_at: string
          currency: string | null
          external_ids: Json
          funnel_url: string | null
          id: string
          language_id: string
          links: Json
          notes: Json | null
          platform: string | null
          presell_url: string | null
          price: number
          product_id: string
          tracking_pixels: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          external_ids?: Json
          funnel_url?: string | null
          id?: string
          language_id: string
          links?: Json
          notes?: Json | null
          platform?: string | null
          presell_url?: string | null
          price?: number
          product_id: string
          tracking_pixels?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          external_ids?: Json
          funnel_url?: string | null
          id?: string
          language_id?: string
          links?: Json
          notes?: Json | null
          platform?: string | null
          presell_url?: string | null
          price?: number
          product_id?: string
          tracking_pixels?: Json
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          created_by: string | null
          details: string | null
          has_backend: boolean
          id: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          details?: string | null
          has_backend?: boolean
          id?: string
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          details?: string | null
          has_backend?: boolean
          id?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      profile_capabilities: {
        Row: {
          capability: Database["public"]["Enums"]["capability_key"]
          enabled: boolean
          profile_id: string
        }
        Insert: {
          capability: Database["public"]["Enums"]["capability_key"]
          enabled?: boolean
          profile_id: string
        }
        Update: {
          capability?: Database["public"]["Enums"]["capability_key"]
          enabled?: boolean
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_capabilities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_tab_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          profile_id: string
          tab: Database["public"]["Enums"]["tab_key"]
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          profile_id: string
          tab: Database["public"]["Enums"]["tab_key"]
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          profile_id?: string
          tab?: Database["public"]["Enums"]["tab_key"]
        }
        Relationships: [
          {
            foreignKeyName: "profile_tab_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          profile_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          profile_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          profile_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_capabilities: {
        Row: {
          capability: Database["public"]["Enums"]["capability_key"]
          enabled: boolean
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          capability: Database["public"]["Enums"]["capability_key"]
          enabled?: boolean
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          capability?: Database["public"]["Enums"]["capability_key"]
          enabled?: boolean
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      sales: {
        Row: {
          campaign_id: string
          id: string
          leads_count: number
          revenue_email: number
          revenue_other: number
          revenue_whatsapp: number
          sales_count: number
          sales_email_count: number
          sales_other_count: number
          sales_whatsapp_count: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          id?: string
          leads_count?: number
          revenue_email?: number
          revenue_other?: number
          revenue_whatsapp?: number
          sales_count?: number
          sales_email_count?: number
          sales_other_count?: number
          sales_whatsapp_count?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          id?: string
          leads_count?: number
          revenue_email?: number
          revenue_other?: number
          revenue_whatsapp?: number
          sales_count?: number
          sales_email_count?: number
          sales_other_count?: number
          sales_whatsapp_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_members: {
        Row: {
          created_at: string
          squad_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          squad_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          squad_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_members_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      squads: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tab_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          role: Database["public"]["Enums"]["app_role"]
          tab: Database["public"]["Enums"]["tab_key"]
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          role: Database["public"]["Enums"]["app_role"]
          tab: Database["public"]["Enums"]["tab_key"]
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          tab?: Database["public"]["Enums"]["tab_key"]
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_edit_demands: {
        Row: {
          aggregate_total_seconds: number | null
          aggregate_video_count: number | null
          card_id: string | null
          created_at: string
          created_by: string | null
          delivered_at: string
          editor_id: string
          id: string
          mode: string
          notes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          aggregate_total_seconds?: number | null
          aggregate_video_count?: number | null
          card_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at: string
          editor_id: string
          id?: string
          mode: string
          notes?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          aggregate_total_seconds?: number | null
          aggregate_video_count?: number | null
          card_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string
          editor_id?: string
          id?: string
          mode?: string
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_edit_demands_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_metrics"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "video_edit_demands_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_edit_demands_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      video_edit_entries: {
        Row: {
          card_id: string | null
          created_at: string
          created_by: string | null
          delivered_at: string
          demand_id: string | null
          duration_seconds: number
          editor_id: string
          id: string
          notes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          card_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at: string
          demand_id?: string | null
          duration_seconds: number
          editor_id: string
          id?: string
          notes?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          card_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string
          demand_id?: string | null
          duration_seconds?: number
          editor_id?: string
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_edit_entries_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_metrics"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "video_edit_entries_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_edit_entries_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "video_edit_demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_edit_entries_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vsls: {
        Row: {
          conversion_pct: number | null
          created_at: string
          created_by: string | null
          id: string
          language_id: string | null
          name: string
          notes: string | null
          pitch_time_seconds: number | null
          product_id: string | null
          type: Database["public"]["Enums"]["vsl_type"]
          updated_at: string
        }
        Insert: {
          conversion_pct?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          language_id?: string | null
          name: string
          notes?: string | null
          pitch_time_seconds?: number | null
          product_id?: string | null
          type: Database["public"]["Enums"]["vsl_type"]
          updated_at?: string
        }
        Update: {
          conversion_pct?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          language_id?: string | null
          name?: string
          notes?: string | null
          pitch_time_seconds?: number | null
          product_id?: string | null
          type?: Database["public"]["Enums"]["vsl_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vsls_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vsls_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_chips: {
        Row: {
          carrier: string | null
          created_at: string
          created_by: string | null
          expires_on: string | null
          id: string
          last_recharge_date: string | null
          nickname: string
          notes: string | null
          payer: string | null
          phone: string
          recharge_amount: number | null
          status: string
          updated_at: string
          usage: string | null
          validity_days: number | null
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          id?: string
          last_recharge_date?: string | null
          nickname: string
          notes?: string | null
          payer?: string | null
          phone: string
          recharge_amount?: number | null
          status?: string
          updated_at?: string
          usage?: string | null
          validity_days?: number | null
        }
        Update: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          id?: string
          last_recharge_date?: string | null
          nickname?: string
          notes?: string | null
          payer?: string | null
          phone?: string
          recharge_amount?: number | null
          status?: string
          updated_at?: string
          usage?: string | null
          validity_days?: number | null
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          campaign_id: string
          created_at: string
          day_of_week: string
          id: string
          message: string
          phase: string
          reactions_count: number
          read_count: number
          recipients_count: number
          revenue: number
          sales_count: number
          sent_time: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          day_of_week: string
          id?: string
          message: string
          phase: string
          reactions_count?: number
          read_count?: number
          recipients_count?: number
          revenue?: number
          sales_count?: number
          sent_time?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          day_of_week?: string
          id?: string
          message?: string
          phase?: string
          reactions_count?: number
          read_count?: number
          recipients_count?: number
          revenue?: number
          sales_count?: number
          sent_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_stats: {
        Row: {
          campaign_id: string
          id: string
          joined_count: number
          left_count: number
          members_count: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          id?: string
          joined_count?: number
          left_count?: number
          members_count?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          id?: string
          joined_count?: number
          left_count?: number
          members_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_stats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      card_metrics: {
        Row: {
          assignee_id: string | null
          board_id: string | null
          card_id: string | null
          completed_at: string | null
          created_at: string | null
          cycle_time_hours: number | null
          lead_time_hours: number | null
          short_id: string | null
          title: string | null
        }
        Insert: {
          assignee_id?: string | null
          board_id?: string | null
          card_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          cycle_time_hours?: never
          lead_time_hours?: never
          short_id?: string | null
          title?: string | null
        }
        Update: {
          assignee_id?: string | null
          board_id?: string | null
          card_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          cycle_time_hours?: never
          lead_time_hours?: never
          short_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      campaign_compare_metrics: {
        Args: { _campaign_ids: string[] }
        Returns: {
          campaign_id: string
          emails_bounced: number
          emails_clicked: number
          emails_complaints: number
          emails_opened: number
          emails_sent: number
          emails_unsubscribed: number
          leads_count: number
          revenue_email: number
          revenue_other: number
          revenue_whatsapp: number
          sales_count: number
          sales_email_count: number
          sales_other_count: number
          sales_whatsapp_count: number
          wa_joined: number
          wa_left: number
          wa_members: number
          wa_messages: number
          wa_reactions: number
          wa_reads: number
          wa_recipients: number
        }[]
      }
      campaign_compare_metrics_by_phase: {
        Args: { _campaign_ids: string[]; _phase?: string }
        Returns: {
          campaign_id: string
          emails_bounced: number
          emails_clicked: number
          emails_complaints: number
          emails_opened: number
          emails_sent: number
          emails_unsubscribed: number
          leads_count: number
          revenue_email: number
          revenue_other: number
          revenue_whatsapp: number
          sales_count: number
          sales_email_count: number
          sales_other_count: number
          sales_whatsapp_count: number
          wa_joined: number
          wa_left: number
          wa_members: number
          wa_messages: number
          wa_reactions: number
          wa_reads: number
          wa_recipients: number
        }[]
      }
      can_edit: { Args: { _user_id: string }; Returns: boolean }
      can_edit_tab: {
        Args: { _tab: Database["public"]["Enums"]["tab_key"]; _user_id: string }
        Returns: boolean
      }
      can_view_board: {
        Args: { _board_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_tab: {
        Args: { _tab: Database["public"]["Enums"]["tab_key"]; _user_id: string }
        Returns: boolean
      }
      get_user_status: { Args: { _user_id: string }; Returns: string }
      has_capability: {
        Args: {
          _cap: Database["public"]["Enums"]["capability_key"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      home_complete_card: { Args: { _card_id: string }; Returns: undefined }
      home_reopen_card: { Args: { _card_id: string }; Returns: undefined }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      is_authenticated_user: { Args: never; Returns: boolean }
      mark_card_notifications_read: {
        Args: { _card_id: string }
        Returns: undefined
      }
      match_document_chunks: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          chunk_id: string
          content: string
          document_id: string
          icon: string
          similarity: number
          title: string
        }[]
      }
      notify_subtask_assigned: {
        Args: { _subitem_id: string; _user_id: string }
        Returns: undefined
      }
      override_subitems_once: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "editor" | "viewer"
      calendar_event_type: "launch" | "offer" | "campaign" | "other"
      capability_key:
        | "move_cards"
        | "create_board"
        | "create_column"
        | "manage_custom_fields"
        | "manage_calendar"
        | "manage_tags"
        | "view_reports"
        | "override_dependencies"
        | "manage_column_kinds"
        | "log_video_edit"
        | "manage_editor_targets"
        | "manage_squads"
      card_priority: "low" | "medium" | "high" | "urgent"
      custom_field_type: "text" | "link" | "select"
      offer_channel: "frontend" | "backend"
      offer_region: "BR" | "LATAM" | "ALE" | "FRA" | "ITA" | "EUA"
      offer_test_status: "running" | "paused" | "finished"
      tab_key:
        | "dashboard"
        | "campaigns"
        | "products"
        | "import"
        | "compare"
        | "ranking"
        | "boards"
        | "calendar"
        | "reports"
        | "users"
        | "settings"
        | "documents"
        | "vsls"
        | "chips"
      vsl_type: "FRONT" | "UP1" | "UP2" | "UP3" | "DOWN1" | "DOWN2"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "editor", "viewer"],
      calendar_event_type: ["launch", "offer", "campaign", "other"],
      capability_key: [
        "move_cards",
        "create_board",
        "create_column",
        "manage_custom_fields",
        "manage_calendar",
        "manage_tags",
        "view_reports",
        "override_dependencies",
        "manage_column_kinds",
        "log_video_edit",
        "manage_editor_targets",
        "manage_squads",
      ],
      card_priority: ["low", "medium", "high", "urgent"],
      custom_field_type: ["text", "link", "select"],
      offer_channel: ["frontend", "backend"],
      offer_region: ["BR", "LATAM", "ALE", "FRA", "ITA", "EUA"],
      offer_test_status: ["running", "paused", "finished"],
      tab_key: [
        "dashboard",
        "campaigns",
        "products",
        "import",
        "compare",
        "ranking",
        "boards",
        "calendar",
        "reports",
        "users",
        "settings",
        "documents",
        "vsls",
        "chips",
      ],
      vsl_type: ["FRONT", "UP1", "UP2", "UP3", "DOWN1", "DOWN2"],
    },
  },
} as const
