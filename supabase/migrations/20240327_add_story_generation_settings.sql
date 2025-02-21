-- Add story generation settings columns to user_settings table
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS story_generation_model text,
ADD COLUMN IF NOT EXISTS use_openai_for_story_gen boolean DEFAULT false;

-- Update the RLS policies
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Users can view their own settings
CREATE POLICY "Users can view their own settings"
    ON user_settings
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update their own settings"
    ON user_settings
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Create updated_at trigger if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_trigger 
        WHERE tgname = 'set_updated_at_user_settings'
    ) THEN
        CREATE TRIGGER set_updated_at_user_settings
            BEFORE UPDATE ON user_settings
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at();
    END IF;
END $$; 