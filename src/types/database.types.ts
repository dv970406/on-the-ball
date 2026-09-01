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
      comment: {
        Row: {
          content: string
          created_at: string
          id: number
          parent_id: number | null
          post_id: number
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: never
          parent_id?: number | null
          post_id: number
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: never
          parent_id?: number | null
          post_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match: {
        Row: {
          away_score: number | null
          away_team: string
          external_id: string
          finished_at: string | null
          home_score: number | null
          home_team: string
          id: number
          kickoff_at: string
          live_minute: number | null
          matchday: number
          result: Database["public"]["Enums"]["match_pick"] | null
          season: string
          voided_at: string | null
        }
        Insert: {
          away_score?: number | null
          away_team: string
          external_id: string
          finished_at?: string | null
          home_score?: number | null
          home_team: string
          id?: never
          kickoff_at: string
          live_minute?: number | null
          matchday: number
          result?: Database["public"]["Enums"]["match_pick"] | null
          season: string
          voided_at?: string | null
        }
        Update: {
          away_score?: number | null
          away_team?: string
          external_id?: string
          finished_at?: string | null
          home_score?: number | null
          home_team?: string
          id?: never
          kickoff_at?: string
          live_minute?: number | null
          matchday?: number
          result?: Database["public"]["Enums"]["match_pick"] | null
          season?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_away_team_fkey"
            columns: ["away_team"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "match_home_team_fkey"
            columns: ["home_team"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["code"]
          },
        ]
      }
      match_event: {
        Row: {
          detail: string | null
          extra_minute: number | null
          id: number
          kind: Database["public"]["Enums"]["match_event_kind"]
          match_id: number
          minute: number
          player_id: number | null
          related_player_id: number | null
          side: Database["public"]["Enums"]["match_side"]
        }
        Insert: {
          detail?: string | null
          extra_minute?: number | null
          id?: never
          kind: Database["public"]["Enums"]["match_event_kind"]
          match_id: number
          minute: number
          player_id?: number | null
          related_player_id?: number | null
          side: Database["public"]["Enums"]["match_side"]
        }
        Update: {
          detail?: string | null
          extra_minute?: number | null
          id?: never
          kind?: Database["public"]["Enums"]["match_event_kind"]
          match_id?: number
          minute?: number
          player_id?: number | null
          related_player_id?: number | null
          side?: Database["public"]["Enums"]["match_side"]
        }
        Relationships: [
          {
            foreignKeyName: "match_event_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_event_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_event_related_player_id_fkey"
            columns: ["related_player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
      match_lineup: {
        Row: {
          coach_name: string | null
          created_at: string
          formation: string | null
          match_id: number
          side: Database["public"]["Enums"]["match_side"]
        }
        Insert: {
          coach_name?: string | null
          created_at?: string
          formation?: string | null
          match_id: number
          side: Database["public"]["Enums"]["match_side"]
        }
        Update: {
          coach_name?: string | null
          created_at?: string
          formation?: string | null
          match_id?: number
          side?: Database["public"]["Enums"]["match_side"]
        }
        Relationships: [
          {
            foreignKeyName: "match_lineup_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match"
            referencedColumns: ["id"]
          },
        ]
      }
      match_lineup_player: {
        Row: {
          grid_col: number | null
          grid_row: number | null
          match_id: number
          player_id: number
          position: string | null
          rating: number | null
          role: Database["public"]["Enums"]["lineup_role"]
          shirt_number: number | null
          side: Database["public"]["Enums"]["match_side"]
          sort_order: number
        }
        Insert: {
          grid_col?: number | null
          grid_row?: number | null
          match_id: number
          player_id: number
          position?: string | null
          rating?: number | null
          role: Database["public"]["Enums"]["lineup_role"]
          shirt_number?: number | null
          side: Database["public"]["Enums"]["match_side"]
          sort_order: number
        }
        Update: {
          grid_col?: number | null
          grid_row?: number | null
          match_id?: number
          player_id?: number
          position?: string | null
          rating?: number | null
          role?: Database["public"]["Enums"]["lineup_role"]
          shirt_number?: number | null
          side?: Database["public"]["Enums"]["match_side"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_lineup_player_match_id_side_fkey"
            columns: ["match_id", "side"]
            isOneToOne: false
            referencedRelation: "match_lineup"
            referencedColumns: ["match_id", "side"]
          },
          {
            foreignKeyName: "match_lineup_player_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
      match_prediction: {
        Row: {
          created_at: string
          match_id: number
          pick: Database["public"]["Enums"]["match_pick"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          match_id: number
          pick: Database["public"]["Enums"]["match_pick"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          match_id?: number
          pick?: Database["public"]["Enums"]["match_pick"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_prediction_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_prediction_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_stat: {
        Row: {
          match_id: number
          side: Database["public"]["Enums"]["match_side"]
          stat_key: string
          value: number
        }
        Insert: {
          match_id: number
          side: Database["public"]["Enums"]["match_side"]
          stat_key: string
          value: number
        }
        Update: {
          match_id?: number
          side?: Database["public"]["Enums"]["match_side"]
          stat_key?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_stat_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match"
            referencedColumns: ["id"]
          },
        ]
      }
      player: {
        Row: {
          external_id: string
          id: number
          name: string
        }
        Insert: {
          external_id: string
          id?: never
          name: string
        }
        Update: {
          external_id?: string
          id?: never
          name?: string
        }
        Relationships: []
      }
      post: {
        Row: {
          author_id: string
          category: Database["public"]["Enums"]["post_category"]
          comment_count: number
          content: string
          created_at: string
          deleted_at: string | null
          excerpt: string
          id: number
          like_count: number
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id: string
          category: Database["public"]["Enums"]["post_category"]
          comment_count?: number
          content: string
          created_at?: string
          deleted_at?: string | null
          excerpt?: string
          id?: never
          like_count?: number
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string
          category?: Database["public"]["Enums"]["post_category"]
          comment_count?: number
          content?: string
          created_at?: string
          deleted_at?: string | null
          excerpt?: string
          id?: never
          like_count?: number
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_like: {
        Row: {
          created_at: string
          post_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_like_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_like_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_poll: {
        Row: {
          created_at: string
          post_id: number
          question: string
        }
        Insert: {
          created_at?: string
          post_id: number
          question: string
        }
        Update: {
          created_at?: string
          post_id?: number
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_poll_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "post"
            referencedColumns: ["id"]
          },
        ]
      }
      post_poll_option: {
        Row: {
          id: number
          label: string
          post_id: number
          sort_order: number
        }
        Insert: {
          id?: never
          label: string
          post_id: number
          sort_order: number
        }
        Update: {
          id?: never
          label?: string
          post_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_poll_option_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_poll"
            referencedColumns: ["post_id"]
          },
        ]
      }
      post_poll_vote: {
        Row: {
          created_at: string
          option_id: number
          post_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          option_id: number
          post_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          option_id?: number
          post_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_poll_vote_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_poll"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "post_poll_vote_post_id_option_id_fkey"
            columns: ["post_id", "option_id"]
            isOneToOne: false
            referencedRelation: "post_poll_option"
            referencedColumns: ["post_id", "id"]
          },
          {
            foreignKeyName: "post_poll_vote_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_report: {
        Row: {
          created_at: string
          post_id: number
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
        }
        Insert: {
          created_at?: string
          post_id: number
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
        }
        Update: {
          created_at?: string
          post_id?: number
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_report_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_report_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      survey: {
        Row: {
          closes_at: string
          created_at: string
          id: number
          title: string
        }
        Insert: {
          closes_at?: string
          created_at?: string
          id?: never
          title: string
        }
        Update: {
          closes_at?: string
          created_at?: string
          id?: never
          title?: string
        }
        Relationships: []
      }
      survey_option: {
        Row: {
          bg_color: string | null
          id: number
          image_path: string | null
          label: string
          sort_order: number
          subtitle: string | null
          survey_id: number
          text_color: string | null
        }
        Insert: {
          bg_color?: string | null
          id?: never
          image_path?: string | null
          label: string
          sort_order: number
          subtitle?: string | null
          survey_id: number
          text_color?: string | null
        }
        Update: {
          bg_color?: string | null
          id?: never
          image_path?: string | null
          label?: string
          sort_order?: number
          subtitle?: string | null
          survey_id?: number
          text_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_option_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "survey"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_vote: {
        Row: {
          created_at: string
          option_id: number
          survey_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          option_id: number
          survey_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          option_id?: number
          survey_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_vote_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "survey"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_vote_survey_id_option_id_fkey"
            columns: ["survey_id", "option_id"]
            isOneToOne: false
            referencedRelation: "survey_option"
            referencedColumns: ["survey_id", "id"]
          },
          {
            foreignKeyName: "survey_vote_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team: {
        Row: {
          code: string
          external_id: string | null
          name: string
          short_name: string
        }
        Insert: {
          code: string
          external_id?: string | null
          name: string
          short_name: string
        }
        Update: {
          code?: string
          external_id?: string | null
          name?: string
          short_name?: string
        }
        Relationships: []
      }
      user_block: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_block_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_block_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_post_with_poll: {
        Args: {
          p_category: Database["public"]["Enums"]["post_category"]
          p_content: string
          p_options: string[]
          p_question: string
          p_title: string
        }
        Returns: number
      }
      has_visible_char: { Args: { p_text: string }; Returns: boolean }
      increment_post_view: { Args: { p_post_id: number }; Returns: undefined }
      is_blocked: { Args: { p_user_id: string }; Returns: boolean }
      match_is_open: { Args: { p_match_id: number }; Returns: boolean }
      match_prediction_results: {
        Args: { p_match_id: number }
        Returns: {
          pick: Database["public"]["Enums"]["match_pick"]
          vote_count: number
        }[]
      }
      normalize_nickname: { Args: { p_text: string }; Returns: string }
      post_is_alive: { Args: { p_id: number }; Returns: boolean }
      post_poll_results: {
        Args: { p_post_id: number }
        Returns: {
          option_id: number
          vote_count: number
        }[]
      }
      random_nickname: { Args: never; Returns: string }
      soft_delete_post: { Args: { p_post_id: number }; Returns: undefined }
      survey_is_open: { Args: { p_survey_id: number }; Returns: boolean }
      survey_results: {
        Args: { p_survey_id: number }
        Returns: {
          option_id: number
          vote_count: number
        }[]
      }
      toggle_post_like: { Args: { p_post_id: number }; Returns: boolean }
    }
    Enums: {
      lineup_role: "start" | "bench"
      match_event_kind: "goal" | "card" | "substitution"
      match_pick: "home" | "draw" | "away"
      match_side: "home" | "away"
      post_category: "이적설" | "경기" | "선수" | "유니폼" | "잡담"
      report_reason: "spam" | "abuse" | "sexual" | "false_info" | "etc"
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
      lineup_role: ["start", "bench"],
      match_event_kind: ["goal", "card", "substitution"],
      match_pick: ["home", "draw", "away"],
      match_side: ["home", "away"],
      post_category: ["이적설", "경기", "선수", "유니폼", "잡담"],
      report_reason: ["spam", "abuse", "sexual", "false_info", "etc"],
    },
  },
} as const

