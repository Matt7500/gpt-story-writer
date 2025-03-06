export interface Story {
  id: string;
  title: string;
  story_idea: string;
  plot_outline: string;
  characters: string;
  created_at: string;
  is_sequel?: boolean;
  parent_story_id?: string | null;
  is_series?: boolean;
  related_stories?: string | string[] | null;
  chapters?: Array<{
    title: string;
    content: string;
    completed: boolean;
  }> | null;
}
