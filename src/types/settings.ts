
export interface UserSettings {
  created_at: string;
  updated_at: string;
  user_id: string;
  openai_key: string | null;
  openai_model: string | null;
  reasoning_model: string | null;
  title_fine_tune_model: string | null;
  rewriting_model: string | null;
  elevenlabs_key: string | null;
  elevenlabs_model: string | null;
  elevenlabs_voice_id: string | null;
  replicate_key: string | null;
}
