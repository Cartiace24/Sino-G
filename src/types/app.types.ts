import type {
  AvailabilityRow,
  AvailabilityStatus,
  ChatMessageRow,
  GroupMemberRow,
  GroupRow,
  HangoutRequestRow,
  HangoutResponseRow,
  HangoutResponseValue,
  MemberRole,
  NotificationRow,
  ProfileRow,
} from './database.types';

export type {
  AvailabilityStatus,
  HangoutResponseValue,
  MemberRole,
  ProfileRow as Profile,
  GroupRow as Group,
  GroupMemberRow as GroupMember,
  AvailabilityRow as Availability,
  HangoutRequestRow as HangoutRequest,
  HangoutResponseRow as HangoutResponse,
  NotificationRow as Notification,
};

/** Group + the current user's membership, as listed on Today / Me. */
export interface GroupWithMembership extends GroupRow {
  my_role: MemberRole;
  member_count: number;
}

/** Member row joined with their public profile. */
export interface MemberWithProfile extends GroupMemberRow {
  profile: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
}

/** Hangout request joined with creator profile + group name. */
export interface HangoutWithMeta extends HangoutRequestRow {
  creator: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
  group_name: string;
}

/** Response joined with responder profile. */
export interface ResponseWithProfile extends HangoutResponseRow {
  profile: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
}

/** Chat message joined with the sender's public profile (null-safe). */
export interface MessageWithSender extends ChatMessageRow {
  sender: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
}

/** Notification joined with the actor's public profile (null-safe). */
export interface NotificationWithActor extends NotificationRow {
  actor: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
}

export interface HangoutCounts {
  down: number;
  maybe: number;
  unavailable: number;
  total: number;
}

/** UI labels map 1:1 to stored values (CAN'T <-> unavailable). */
export const RESPONSE_LABEL: Record<HangoutResponseValue, string> = {
  down: "I'm down",
  maybe: 'Maybe',
  unavailable: "Can't",
};

export interface AvailabilityInput {
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  status: AvailabilityStatus;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  avatarFile?: File | null;
}

export interface CreateHangoutInput {
  group_id: string;
  title?: string;
  message?: string;
  location?: string;
  location_lat?: number | null;
  location_lng?: number | null;
  proposed_time?: string | null; // ISO string
  expires_at?: string | null;
}

/** Editable hangout details (date/time/location). Title edits are out of V1. */
export interface UpdateHangoutInput {
  proposed_time?: string | null; // ISO string
  location?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  message?: string | null;
}

/** A pinned map selection: readable name plus exact coordinates. */
export interface PinnedLocation {
  name: string;
  lat: number;
  lng: number;
}
