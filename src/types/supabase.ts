export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: {
    foreignKeyName: string;
    columns: string[];
    isOneToOne: boolean;
    referencedRelation: string;
    referencedColumns: string[];
  }[];
};

export type Database = {
  public: {
    Tables: {
      [key: string]: GenericTable;
      player_game_logs: {
        Row: {
          id: string;
          player_id: number;
          player_name: string;
          season_id: string;
          scoring_period_id: number;
          game_date: string | null;
          pro_team_id: number | null;
          pts: number | null;
          reb: number | null;
          ast: number | null;
          stl: number | null;
          blk: number | null;
          turnovers: number | null;
          three_pm: number | null;
          fg_made: number | null;
          fg_attempted: number | null;
          fg_pct: number | null;
          ft_made: number | null;
          ft_attempted: number | null;
          ft_pct: number | null;
          minutes: number | null;
          fantasy_points: number | null;
          stats_raw: Json;
          source: string;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          player_id: number;
          player_name: string;
          season_id: string;
          scoring_period_id: number;
          game_date?: string | null;
          pro_team_id?: number | null;
          pts?: number | null;
          reb?: number | null;
          ast?: number | null;
          stl?: number | null;
          blk?: number | null;
          turnovers?: number | null;
          three_pm?: number | null;
          fg_made?: number | null;
          fg_attempted?: number | null;
          fg_pct?: number | null;
          ft_made?: number | null;
          ft_attempted?: number | null;
          ft_pct?: number | null;
          minutes?: number | null;
          fantasy_points?: number | null;
          stats_raw?: Json;
          source?: string;
          fetched_at?: string;
        };
        Update: {
          id?: string;
          player_id?: number;
          player_name?: string;
          season_id?: string;
          scoring_period_id?: number;
          game_date?: string | null;
          pro_team_id?: number | null;
          pts?: number | null;
          reb?: number | null;
          ast?: number | null;
          stl?: number | null;
          blk?: number | null;
          turnovers?: number | null;
          three_pm?: number | null;
          fg_made?: number | null;
          fg_attempted?: number | null;
          fg_pct?: number | null;
          ft_made?: number | null;
          ft_attempted?: number | null;
          ft_pct?: number | null;
          minutes?: number | null;
          fantasy_points?: number | null;
          stats_raw?: Json;
          source?: string;
          fetched_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          gemini_api_key_encrypted: string | null;
          espn_league_id: string | null;
          espn_team_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          gemini_api_key_encrypted?: string | null;
          espn_league_id?: string | null;
          espn_team_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          gemini_api_key_encrypted?: string | null;
          espn_league_id?: string | null;
          espn_team_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
