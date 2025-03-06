import { Story } from './story';

export interface Series {
  id: string;
  title: string;
  description: string;
  cover_image?: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  story_order?: string[] | null; // Array of story IDs in order
}

export interface SeriesWithStories extends Series {
  stories: Story[];
}

export interface SeriesStory {
  id: string;
  series_id: string;
  story_id: string;
  position: number;
  created_at: string;
} 