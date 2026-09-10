import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Central query-key factory so invalidation stays consistent. */
export const qk = {
  profile: (userId: string) => ['profile', userId] as const,
  groups: (userId: string) => ['groups', userId] as const,
  groupsAll: () => ['groups'] as const,
  group: (groupId: string) => ['group', groupId] as const,
  groupAll: () => ['group'] as const,
  groupMembers: (groupId: string) => ['group-members', groupId] as const,
  groupMembersAll: () => ['group-members'] as const,
  groupInvites: (groupId: string) => ['group-invites', groupId] as const,
  myAvailability: (userId: string, from: string, to: string) =>
    ['my-availability', userId, from, to] as const,
  groupAvailability: (groupId: string, date: string) =>
    ['group-availability', groupId, date] as const,
  /** Prefix: all dates for one group (realtime availability churn). */
  groupAvailabilityForGroup: (groupId: string) => ['group-availability', groupId] as const,
  groupAvailabilityAll: () => ['group-availability'] as const,
  tonightStatus: (userId: string, date: string) => ['tonight', userId, date] as const,
  /** Prefix: all dates for one user. */
  tonightForUser: (userId: string) => ['tonight', userId] as const,
  /** Prefix: tonight member-set (membership churn affects it). */
  tonightMembers: () => ['tonight-members'] as const,
  hangouts: (groupId: string) => ['hangouts', groupId] as const,
  myHangouts: (userId: string) => ['my-hangouts', userId] as const,
  hangout: (hangoutId: string) => ['hangout', hangoutId] as const,
  hangoutResponses: (hangoutId: string) => ['hangout-responses', hangoutId] as const,
  /** Base: per-list down-count maps append their id-hash after this prefix. */
  hangoutCounts: () => ['hangout-counts'] as const,
  groupMessages: (groupId: string) => ['group-messages', groupId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  unreadCount: (userId: string) => ['notifications', userId, 'unread-count'] as const,
  bestUpcoming: () => ['best-upcoming'] as const,
};
