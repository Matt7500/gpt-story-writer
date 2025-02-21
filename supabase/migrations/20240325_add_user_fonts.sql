-- Create user_fonts table
CREATE TABLE IF NOT EXISTS user_fonts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    font_name VARCHAR(255) NOT NULL,
    font_file_path VARCHAR(255) NOT NULL,
    font_family VARCHAR(255) NOT NULL,
    font_weight VARCHAR(255) NOT NULL DEFAULT 'normal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, font_name)
);

-- Add RLS policies
ALTER TABLE user_fonts ENABLE ROW LEVEL SECURITY;

-- Users can view their own fonts
CREATE POLICY "Users can view their own fonts"
    ON user_fonts
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own fonts
CREATE POLICY "Users can insert their own fonts"
    ON user_fonts
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own fonts
CREATE POLICY "Users can update their own fonts"
    ON user_fonts
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own fonts
CREATE POLICY "Users can delete their own fonts"
    ON user_fonts
    FOR DELETE
    USING (auth.uid() = user_id); 