
export interface UserSettings {
  created_at: string;
  updated_at: string;
  user_id: string;
  openai_key: string | null;
  openai_model: string | null;
  reasoning_model: string | null;
  title_fine_tune_model: string | null;
  rewriting_model: string | null;
}
