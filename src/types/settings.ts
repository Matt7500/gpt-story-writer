export interface UserSettings {
  user_id: string;
  openai_key?: string;
  openrouter_key?: string;
  openrouter_model: string;
  reasoning_model: string;
  title_fine_tune_model?: string;
  rewriting_model?: string;
  rewrite_model: string;
  story_generation_model: string;
  story_idea_model?: string;
  use_openai_for_story_gen: boolean;
  elevenlabs_key?: string;
  elevenlabs_model: string;
  elevenlabs_voice_id?: string;
  replicate_key?: string;
}
