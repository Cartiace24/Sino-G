import { useQuery } from '@tanstack/react-query';
import { qk } from '../lib/queryClient';
import { profilesService } from '../services/profiles.service';

export function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? qk.profile(userId) : ['profile', 'none'],
    queryFn: () => profilesService.getMyProfile(userId!),
    enabled: Boolean(userId),
  });
}
