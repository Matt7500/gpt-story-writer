# Plotter Palette

A web application for generating and managing story ideas, outlines, and characters.

## Frontend-Only Version

This version of Plotter Palette has been refactored to run entirely in the browser without requiring a backend server. All API calls are made directly from the frontend, and data is stored in Supabase.

## Prerequisites

- Node.js & npm installed
- An OpenAI API key
- A Supabase account and project

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
# Supabase
VITE_SUPABASE_URL="your-supabase-url"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

You don't need to include your OpenAI API key in the environment variables as it will be stored in the user settings in Supabase.

## Getting Started

1. Install dependencies:

```sh
npm install --legacy-peer-deps
```

> **Note:** The `--legacy-peer-deps` flag is required to resolve peer dependency conflicts.

2. Start the development server:

```sh
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

4. Sign in or create an account

5. Go to Settings and add your OpenAI API key
   - The API key should start with `sk-` and be followed by a series of characters
   - You can get an API key from [OpenAI's platform](https://platform.openai.com/api-keys)

6. Start creating stories!

## Database Setup

The application requires the following tables in your Supabase database:

### user_settings

```sql
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  openrouter_key TEXT,
  openai_key TEXT,
  openrouter_model TEXT DEFAULT 'gpt-4o-mini',
  reasoning_model TEXT DEFAULT 'llama-3.1-sonar-small-128k-online',
  title_fine_tune_model TEXT DEFAULT 'gpt-4',
  rewriting_model TEXT DEFAULT 'gpt-4',
  rewrite_model TEXT DEFAULT 'gpt-4',
  story_generation_model TEXT DEFAULT 'gpt-4',
  use_openai_for_story_gen BOOLEAN DEFAULT false,
  elevenlabs_key TEXT,
  elevenlabs_model TEXT DEFAULT 'eleven_multilingual_v2',
  elevenlabs_voice_id TEXT,
  replicate_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add RLS policies
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);
```

### stories

```sql
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  story_idea TEXT,
  plot_outline TEXT,
  characters TEXT,
  chapters JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add RLS policies
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own stories"
  ON stories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own stories"
  ON stories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stories"
  ON stories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own stories"
  ON stories FOR DELETE
  USING (auth.uid() = user_id);
```

## Building for Production

To build the application for production:

```sh
npm run build --legacy-peer-deps
```

The built files will be in the `dist` directory, which can be deployed to any static hosting service.

## Deployment Options

You can deploy this application to any static hosting service, such as:

- Vercel
- Netlify
- GitHub Pages
- Cloudflare Pages
- Firebase Hosting

Simply connect your repository to the hosting service and configure it to build with `npm run build --legacy-peer-deps`.

## Troubleshooting

### Dependency Issues

If you encounter dependency conflicts during installation, use the `--legacy-peer-deps` flag:

```sh
npm install --legacy-peer-deps
```

This is necessary due to some peer dependency conflicts between packages.

### API Key Issues

If you encounter errors related to the OpenAI API key:

1. Make sure you've entered your API key in the Settings page
2. Verify that your API key is valid and has not expired
3. Check that you have sufficient credits in your OpenAI account
4. Try refreshing the page or signing out and back in

## License

MIT
