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
  group: (groupId: string) => ['group', groupId] as const,
  groupMembers: (groupId: string) => ['group-members', groupId] as const,
  groupInvites: (groupId: string) => ['group-invites', groupId] as const,
  myAvailability: (userId: string, from: string, to: string) =>
    ['my-availability', userId, from, to] as const,
  groupAvailability: (groupId: string, date: string) =>
    ['group-availability', groupId, date] as const,
  tonightStatus: (userId: string, date: string) => ['tonight', userId, date] as const,
  hangouts: (groupId: string) => ['hangouts', groupId] as const,
  myHangouts: (userId: string) => ['my-hangouts', userId] as const,
  hangout: (hangoutId: string) => ['hangout', hangoutId] as const,
  hangoutResponses: (hangoutId: string) => ['hangout-responses', hangoutId] as const,
  groupMessages: (groupId: string) => ['group-messages', groupId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  unreadCount: (userId: string) => ['notifications', userId, 'unread-count'] as const,
};
