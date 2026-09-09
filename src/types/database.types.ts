/**
 * Hand-maintained mirror of the Supabase schema (see supabase/migrations).
 * Keep in sync with the migration; regenerate with
 * `supabase gen types typescript` when the schema changes.
 */

export type MemberRole = 'owner' | 'admin' | 'member';
export type AvailabilityStatus = 'free' | 'maybe' | 'busy';
export type HangoutStatus = 'active' | 'closed' | 'cancelled';
export type HangoutResponseValue = 'down' | 'maybe' | 'unavailable';

export type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_by: string | null;
  invite_code: string;
  created_at: string;
  updated_at: string;
};

export type GroupMemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
};

export type GroupInviteRow = {
  id: string;
  group_id: string;
  invited_by: string;
  invite_code: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  created_at: string;
};

export type AvailabilityRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  status: AvailabilityStatus;
  created_at: string;
  updated_at: string;
};

export type HangoutRequestRow = {
  id: string;
  group_id: string;
  created_by: string;
  title: string | null;
  message: string | null;
  location: string | null;
  proposed_time: string | null;
  expires_at: string | null;
  status: HangoutStatus;
  created_at: string;
};

export type HangoutResponseRow = {
  id: string;
  hangout_request_id: string;
  user_id: string;
  response: HangoutResponseValue;
  responded_at: string;
};

export type NotificationType =
  | 'member_joined'
  | 'member_removed'
  | 'promoted_to_admin'
  | 'demoted_to_member'
  | 'hangout_created'
  | 'hangout_response'
  | 'hangout_cancelled'
  | 'hangout_closed'
  | 'hangout_nudge'
  | 'new_message';

export type ChatMessageRow = {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  group_id: string | null;
  hangout_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: { id: string; username: string; display_name: string; avatar_url?: string | null };
        Update: { username?: string; display_name?: string; avatar_url?: string | null; updated_at?: string };
        Relationships: [];
      };
      groups: {
        Row: GroupRow;
        Insert: { name: string; description?: string | null; avatar_url?: string | null; created_by?: string | null; invite_code?: string };
        Update: { name?: string; description?: string | null; avatar_url?: string | null; updated_at?: string };
        Relationships: [];
      };
      group_members: {
        Row: GroupMemberRow;
        Insert: { group_id: string; user_id: string; role?: MemberRole };
        Update: { role?: MemberRole };
        Relationships: [];
      };
      group_invites: {
        Row: GroupInviteRow;
        Insert: { group_id: string; invited_by: string; invite_code?: string; expires_at?: string | null; max_uses?: number | null };
        Update: { expires_at?: string | null; max_uses?: number | null; uses?: number };
        Relationships: [];
      };
      availability: {
        Row: AvailabilityRow;
        Insert: { user_id: string; date: string; start_time: string; end_time: string; status: AvailabilityStatus };
        Update: { date?: string; start_time?: string; end_time?: string; status?: AvailabilityStatus; updated_at?: string };
        Relationships: [];
      };
      hangout_requests: {
        Row: HangoutRequestRow;
        Insert: { group_id: string; created_by: string; title?: string | null; message?: string | null; location?: string | null; proposed_time?: string | null; expires_at?: string | null; status?: HangoutStatus };
        Update: { title?: string | null; message?: string | null; location?: string | null; proposed_time?: string | null; expires_at?: string | null; status?: HangoutStatus };
        Relationships: [];
      };
      hangout_responses: {
        Row: HangoutResponseRow;
        Insert: { hangout_request_id: string; user_id: string; response: HangoutResponseValue; responded_at?: string };
        Update: { response?: HangoutResponseValue; responded_at?: string };
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        // No client insert path by design (no RLS insert policy either):
        // rows are written only by the SECURITY DEFINER triggers in 0009.
        // `never` makes any future .insert() call a compile error.
        Insert: never;
        Update: { read_at?: string | null };
        Relationships: [];
      };
      group_messages: {
        Row: ChatMessageRow;
        Insert: { group_id: string; sender_id: string; content: string };
        Update: never;
        Relationships: [];
      };
    };
    Functions: {
      is_group_member: { Args: { p_group_id: string }; Returns: boolean };
      is_group_owner: { Args: { p_group_id: string }; Returns: boolean };
      is_group_owner_or_admin: { Args: { p_group_id: string }; Returns: boolean };
      join_group_with_code: { Args: { p_code: string }; Returns: string };
      nudge_hangout: { Args: { p_hangout_id: string }; Returns: number };
      create_group: { Args: { p_name: string; p_description: string | null }; Returns: GroupRow };
    };
    Views: { [_ in never]: never };
    Enums: { [_ in never]: never };
  };
};
