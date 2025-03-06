import { supabase } from '@/integrations/supabase/client';
import { browserCache } from '@/lib/cache';
import { Series, SeriesWithStories } from '@/types/series';
import { Story } from '@/types/story';

export class SeriesService {
  private static instance: SeriesService;
  private userId: string | null = null;

  private constructor() {}

  public static getInstance(): SeriesService {
    if (!SeriesService.instance) {
      SeriesService.instance = new SeriesService();
    }
    return SeriesService.instance;
  }

  public setUserId(userId: string) {
    this.userId = userId;
  }

  // Get all series for a user
  public async getUserSeries(forceRefresh: boolean = false): Promise<Series[]> {
    if (!this.userId) {
      throw new Error('User ID not set');
    }

    try {
      // Check cache first (unless force refresh is requested)
      const cacheKey = `user_series_${this.userId}`;
      const cachedSeries = !forceRefresh ? browserCache.get<Series[]>(cacheKey) : null;
      
      if (cachedSeries) {
        console.log('Using cached series');
        return cachedSeries;
      }

      // Fetch from Supabase if not in cache or force refresh requested
      const { data, error } = await supabase
        .from('series')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Cache the results
      browserCache.set(cacheKey, data || []);
      
      return data || [];
    } catch (error) {
      console.error('Error getting user series:', error);
      throw error;
    }
  }

  // Get series by ID with its stories
  public async getSeriesWithStories(seriesId: string): Promise<SeriesWithStories> {
    try {
      // Check cache first
      const cacheKey = `series_${seriesId}`;
      const cachedSeries = browserCache.get<SeriesWithStories>(cacheKey);
      
      if (cachedSeries) {
        console.log('Using cached series with stories');
        return cachedSeries;
      }

      // Fetch series from Supabase
      const { data: seriesData, error: seriesError } = await supabase
        .from('series')
        .select('*')
        .eq('id', seriesId)
        .single();

      if (seriesError) throw seriesError;
      
      // Fetch series_stories junction table entries
      const { data: seriesStoriesData, error: seriesStoriesError } = await supabase
        .from('series_stories')
        .select('*')
        .eq('series_id', seriesId)
        .order('position', { ascending: true });

      if (seriesStoriesError) throw seriesStoriesError;
      
      // Get story IDs from the junction table
      const storyIds = seriesStoriesData.map(item => item.story_id);
      
      // Fetch stories if there are any
      let stories: Story[] = [];
      if (storyIds.length > 0) {
        const { data: storiesData, error: storiesError } = await supabase
          .from('stories')
          .select('*')
          .in('id', storyIds);
          
        if (storiesError) throw storiesError;
        
        // Transform the data to match Story type
        stories = (storiesData || []).map(story => ({
          ...story,
          chapters: Array.isArray(story.chapters) ? story.chapters : JSON.parse(story.chapters as string)
        }));
        
        // Sort stories according to the position in series_stories
        stories.sort((a, b) => {
          const aIndex = seriesStoriesData.findIndex(item => item.story_id === a.id);
          const bIndex = seriesStoriesData.findIndex(item => item.story_id === b.id);
          return aIndex - bIndex;
        });
      }
      
      // Combine series with stories
      const seriesWithStories: SeriesWithStories = {
        ...seriesData,
        stories
      };
      
      // Cache the results
      browserCache.set(cacheKey, seriesWithStories);
      
      return seriesWithStories;
    } catch (error) {
      console.error('Error getting series with stories:', error);
      throw error;
    }
  }

  // Create a new series
  public async createSeries(title: string, description: string): Promise<Series> {
    if (!this.userId) {
      throw new Error('User ID not set');
    }

    try {
      const newSeries = {
        title,
        description,
        user_id: this.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('series')
        .insert([newSeries])
        .select()
        .single();

      if (error) throw error;
      
      // Clear the user series cache
      browserCache.remove(`user_series_${this.userId}`);
      
      return data;
    } catch (error) {
      console.error('Error creating series:', error);
      throw error;
    }
  }

  // Add a story to a series
  public async addStoryToSeries(seriesId: string, storyId: string, position?: number): Promise<void> {
    try {
      // Check if the story is already in the series
      const { data: existingData, error: existingError } = await supabase
        .from('series_stories')
        .select('*')
        .eq('series_id', seriesId)
        .eq('story_id', storyId);

      if (existingError) throw existingError;
      
      if (existingData && existingData.length > 0) {
        // Story is already in the series
        return;
      }
      
      // If position is not provided, add to the end
      if (position === undefined) {
        // Get the current highest position
        const { data: positionData, error: positionError } = await supabase
          .from('series_stories')
          .select('position')
          .eq('series_id', seriesId)
          .order('position', { ascending: false })
          .limit(1);

        if (positionError) throw positionError;
        
        position = positionData && positionData.length > 0 ? positionData[0].position + 1 : 0;
      }
      
      // Add the story to the series
      const { error } = await supabase
        .from('series_stories')
        .insert([{
          series_id: seriesId,
          story_id: storyId,
          position,
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;
      
      // Clear the series cache
      browserCache.remove(`series_${seriesId}`);
    } catch (error) {
      console.error('Error adding story to series:', error);
      throw error;
    }
  }

  // Remove a story from a series
  public async removeStoryFromSeries(seriesId: string, storyId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('series_stories')
        .delete()
        .eq('series_id', seriesId)
        .eq('story_id', storyId);

      if (error) throw error;
      
      // Clear the series cache
      browserCache.remove(`series_${seriesId}`);
    } catch (error) {
      console.error('Error removing story from series:', error);
      throw error;
    }
  }

  // Reorder stories in a series
  public async reorderSeriesStories(seriesId: string, storyIds: string[]): Promise<void> {
    try {
      // Update positions for all stories
      const updates = storyIds.map((storyId, index) => ({
        series_id: seriesId,
        story_id: storyId,
        position: index
      }));
      
      // Use a transaction to update all positions
      const { error } = await supabase.rpc('update_series_story_positions', {
        updates_json: JSON.stringify(updates)
      });

      if (error) throw error;
      
      // Clear the series cache
      browserCache.remove(`series_${seriesId}`);
    } catch (error) {
      console.error('Error reordering series stories:', error);
      throw error;
    }
  }

  // Delete a series
  public async deleteSeries(seriesId: string): Promise<void> {
    if (!this.userId) {
      throw new Error('User ID not set');
    }

    try {
      // Delete the series
      const { error } = await supabase
        .from('series')
        .delete()
        .eq('id', seriesId)
        .eq('user_id', this.userId);

      if (error) throw error;
      
      // Clear the caches
      browserCache.remove(`series_${seriesId}`);
      browserCache.remove(`user_series_${this.userId}`);
    } catch (error) {
      console.error('Error deleting series:', error);
      throw error;
    }
  }

  // Get series for a specific story
  public async getSeriesForStory(storyId: string): Promise<Series | null> {
    try {
      // Find the series_stories entry for this story
      const { data: seriesStoryData, error: seriesStoryError } = await supabase
        .from('series_stories')
        .select('series_id')
        .eq('story_id', storyId);

      if (seriesStoryError) throw seriesStoryError;
      
      // If no series found, return null
      if (!seriesStoryData || seriesStoryData.length === 0) return null;
      
      // Get the series details
      const { data: seriesData, error: seriesError } = await supabase
        .from('series')
        .select('*')
        .eq('id', seriesStoryData[0].series_id)
        .single();

      if (seriesError) throw seriesError;
      
      return seriesData;
    } catch (error) {
      console.error('Error getting series for story:', error);
      return null;
    }
  }
} 