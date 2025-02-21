-- Create the user_fonts table
CREATE TABLE public.user_fonts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    font_name text NOT NULL,
    font_file_path text NOT NULL,
    font_family text NOT NULL,
    font_weight text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_fonts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own fonts"
    ON public.user_fonts
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own fonts"
    ON public.user_fonts
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fonts"
    ON public.user_fonts
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fonts"
    ON public.user_fonts
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.user_fonts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at(); 