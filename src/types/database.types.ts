export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          id: string
          nickname: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          id: string
          nickname: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          id?: string
          nickname?: string
        }
        Relationships: []
      }
      transfer_club: {
        Row: {
          canonical: string
          code: string
          league: string | null
          name: string
          short_name: string
          updated_at: string
        }
        Insert: {
          canonical: string
          code: string
          league?: string | null
          name: string
          short_name: string
          updated_at?: string
        }
        Update: {
          canonical?: string
          code?: string
          league?: string | null
          name?: string
          short_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      transfer_deal: {
        Row: {
          add_on_amount: number | null
          birth_year: number | null
          contract_text: string | null
          deal_key: string
          fee_amount: number | null
          fee_currency: string | null
          fee_high_amount: number | null
          fee_low_amount: number | null
          fee_text: string | null
          first_reported_at: string
          from_club_code: string | null
          id: number
          is_free_agent: boolean
          latest_reported_at: string
          nationality: string | null
          player: string
          player_ko: string | null
          position: string | null
          prev_fee_amount: number | null
          report_count: number
          stage: Database["public"]["Enums"]["transfer_stage"]
          to_club_code: string | null
          updated_at: string
          wage_text: string | null
        }
        Insert: {
          add_on_amount?: number | null
          birth_year?: number | null
          contract_text?: string | null
          deal_key: string
          fee_amount?: number | null
          fee_currency?: string | null
          fee_high_amount?: number | null
          fee_low_amount?: number | null
          fee_text?: string | null
          first_reported_at: string
          from_club_code?: string | null
          id?: never
          is_free_agent?: boolean
          latest_reported_at: string
          nationality?: string | null
          player: string
          player_ko?: string | null
          position?: string | null
          prev_fee_amount?: number | null
          report_count: number
          stage: Database["public"]["Enums"]["transfer_stage"]
          to_club_code?: string | null
          updated_at?: string
          wage_text?: string | null
        }
        Update: {
          add_on_amount?: number | null
          birth_year?: number | null
          contract_text?: string | null
          deal_key?: string
          fee_amount?: number | null
          fee_currency?: string | null
          fee_high_amount?: number | null
          fee_low_amount?: number | null
          fee_text?: string | null
          first_reported_at?: string
          from_club_code?: string | null
          id?: never
          is_free_agent?: boolean
          latest_reported_at?: string
          nationality?: string | null
          player?: string
          player_ko?: string | null
          position?: string | null
          prev_fee_amount?: number | null
          report_count?: number
          stage?: Database["public"]["Enums"]["transfer_stage"]
          to_club_code?: string | null
          updated_at?: string
          wage_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_deal_from_club_code_fkey"
            columns: ["from_club_code"]
            isOneToOne: false
            referencedRelation: "transfer_club"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transfer_deal_to_club_code_fkey"
            columns: ["to_club_code"]
            isOneToOne: false
            referencedRelation: "transfer_club"
            referencedColumns: ["code"]
          },
        ]
      }
      transfer_deal_comment: {
        Row: {
          content: string
          created_at: string
          deal_id: number
          down_count: number
          id: number
          parent_id: number | null
          up_count: number
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          deal_id: number
          down_count?: number
          id?: never
          parent_id?: number | null
          up_count?: number
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deal_id?: number
          down_count?: number
          id?: never
          parent_id?: number | null
          up_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_deal_comment_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "transfer_deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_deal_comment_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "transfer_deal_comment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_deal_comment_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_deal_comment_vote: {
        Row: {
          comment_id: number
          created_at: string
          user_id: string
          value: number
        }
        Insert: {
          comment_id: number
          created_at?: string
          user_id: string
          value: number
        }
        Update: {
          comment_id?: number
          created_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "transfer_deal_comment_vote_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "transfer_deal_comment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_deal_comment_vote_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_deal_suitor: {
        Row: {
          club_code: string
          deal_id: number
          position: number
        }
        Insert: {
          club_code: string
          deal_id: number
          position: number
        }
        Update: {
          club_code?: string
          deal_id?: number
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "transfer_deal_suitor_club_code_fkey"
            columns: ["club_code"]
            isOneToOne: false
            referencedRelation: "transfer_club"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transfer_deal_suitor_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "transfer_deal"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_deal_watch: {
        Row: {
          created_at: string
          deal_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          deal_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          deal_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_deal_watch_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "transfer_deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_deal_watch_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_name_ko: {
        Row: {
          checked_at: string
          key: string
          kind: string
          name_en: string
          name_ko: string | null
          source: string
          wikidata_id: string | null
        }
        Insert: {
          checked_at?: string
          key: string
          kind: string
          name_en: string
          name_ko?: string | null
          source?: string
          wikidata_id?: string | null
        }
        Update: {
          checked_at?: string
          key?: string
          kind?: string
          name_en?: string
          name_ko?: string | null
          source?: string
          wikidata_id?: string | null
        }
        Relationships: []
      }
      transfer_news: {
        Row: {
          attributed_to: string | null
          attribution: Database["public"]["Enums"]["transfer_attribution"]
          author_handle: string | null
          body: string
          body_excerpt: string | null
          clubs: string[]
          cluster_key: string | null
          deal_id: number | null
          external_id: string
          fee_amount: number | null
          fee_currency: string | null
          fee_text: string | null
          fetched_at: string
          id: number
          players: string[]
          provenance_url: string | null
          published_at: string
          relevance: number
          source_id: string
          stage: Database["public"]["Enums"]["transfer_stage"]
          summary_ko: string | null
          tier: number
          url: string | null
          verdict: Database["public"]["Enums"]["transfer_verdict"] | null
          verdict_at: string | null
          verdict_evidence: string | null
          verdict_from: string | null
          verdict_player: string | null
          verdict_player_name: string | null
          verdict_stage: Database["public"]["Enums"]["transfer_stage"] | null
          verdict_suitors: string[]
          verdict_to: string | null
        }
        Insert: {
          attributed_to?: string | null
          attribution: Database["public"]["Enums"]["transfer_attribution"]
          author_handle?: string | null
          body: string
          body_excerpt?: string | null
          clubs?: string[]
          cluster_key?: string | null
          deal_id?: number | null
          external_id: string
          fee_amount?: number | null
          fee_currency?: string | null
          fee_text?: string | null
          fetched_at?: string
          id?: never
          players?: string[]
          provenance_url?: string | null
          published_at: string
          relevance: number
          source_id: string
          stage: Database["public"]["Enums"]["transfer_stage"]
          summary_ko?: string | null
          tier: number
          url?: string | null
          verdict?: Database["public"]["Enums"]["transfer_verdict"] | null
          verdict_at?: string | null
          verdict_evidence?: string | null
          verdict_from?: string | null
          verdict_player?: string | null
          verdict_player_name?: string | null
          verdict_stage?: Database["public"]["Enums"]["transfer_stage"] | null
          verdict_suitors?: string[]
          verdict_to?: string | null
        }
        Update: {
          attributed_to?: string | null
          attribution?: Database["public"]["Enums"]["transfer_attribution"]
          author_handle?: string | null
          body?: string
          body_excerpt?: string | null
          clubs?: string[]
          cluster_key?: string | null
          deal_id?: number | null
          external_id?: string
          fee_amount?: number | null
          fee_currency?: string | null
          fee_text?: string | null
          fetched_at?: string
          id?: never
          players?: string[]
          provenance_url?: string | null
          published_at?: string
          relevance?: number
          source_id?: string
          stage?: Database["public"]["Enums"]["transfer_stage"]
          summary_ko?: string | null
          tier?: number
          url?: string | null
          verdict?: Database["public"]["Enums"]["transfer_verdict"] | null
          verdict_at?: string | null
          verdict_evidence?: string | null
          verdict_from?: string | null
          verdict_player?: string | null
          verdict_player_name?: string | null
          verdict_stage?: Database["public"]["Enums"]["transfer_stage"] | null
          verdict_suitors?: string[]
          verdict_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_news_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "transfer_deal"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_visible_char: { Args: { p_text: string }; Returns: boolean }
      is_plain_nickname: { Args: { p_text: string }; Returns: boolean }
      normalize_nickname: { Args: { p_text: string }; Returns: string }
      random_nickname: { Args: never; Returns: string }
    }
    Enums: {
      transfer_attribution:
        | "verified_author"
        | "linked_mirror"
        | "outlet"
        | "cited"
      transfer_stage:
        | "rumour"
        | "talks"
        | "offer"
        | "agreement"
        | "personal_terms"
        | "medical"
        | "here_we_go"
        | "official"
        | "collapsed"
        | "denied"
        | "unknown"
      transfer_verdict: "move" | "not_move"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      transfer_attribution: [
        "verified_author",
        "linked_mirror",
        "outlet",
        "cited",
      ],
      transfer_stage: [
        "rumour",
        "talks",
        "offer",
        "agreement",
        "personal_terms",
        "medical",
        "here_we_go",
        "official",
        "collapsed",
        "denied",
        "unknown",
      ],
      transfer_verdict: ["move", "not_move"],
    },
  },
} as const

