import { useEffect } from 'react';
import { SeriesService } from '@/services/SeriesService';
import { useAuth } from '@/components/AuthProvider';

export function useSeriesService() {
  const { user } = useAuth();
  const seriesService = SeriesService.getInstance();

  useEffect(() => {
    if (user) {
      seriesService.setUserId(user.id);
    }
  }, [user]);

  return seriesService;
} 