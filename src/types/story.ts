export interface Story {
  id: string;
  title: string;
  story_idea: string;
  plot_outline: string;
  characters: string;
  created_at: string;
  chapters?: Array<{
    title: string;
    content: string;
    completed: boolean;
  }> | null;
}
