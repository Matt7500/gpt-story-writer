export interface UserSettings {
  created_at: string;
  updated_at: string;
  user_id: string;
  openai_key: string | null;
  openrouter_key: string | null;
  openrouter_model: string | null;
  reasoning_model: string | null;
  title_fine_tune_model: string | null;
  rewriting_model: string | null;
  rewrite_model: string | null;
  story_generation_model: string | null;
  use_openai_for_story_gen: boolean;
  elevenlabs_key: string | null;
  elevenlabs_model: string | null;
  elevenlabs_voice_id: string | null;
  replicate_key: string | null;
}
