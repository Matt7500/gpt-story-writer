import { useEffect } from 'react';
import { storyService } from '@/services/StoryService';
import { useAuth } from '@/components/AuthProvider';

export function useStoryService() {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      storyService.setUserId(user.id);
      storyService.loadUserSettings().catch(err => {
        console.error('Failed to load user settings:', err);
      });
    }
  }, [user]);

  return storyService;
} 