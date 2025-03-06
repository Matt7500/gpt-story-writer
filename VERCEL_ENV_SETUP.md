# Vercel Environment Variables Setup

When deploying to Vercel, make sure to add the following environment variables in the Vercel dashboard:

## Required Environment Variables

- `VITE_SUPABASE_URL`: https://pmecviefmnhttigzamre.supabase.co
- `VITE_SUPABASE_ANON_KEY`: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZWN2aWVmbW5odHRpZ3phbXJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk4MTMxODcsImV4cCI6MjA1NTM4OTE4N30.8LRwp__RbzfsTFOjzhYNoZmQ-vnG0is7MlCRBXL8nVI
- `SUPABASE_URL`: https://pmecviefmnhttigzamre.supabase.co
- `SUPABASE_SERVICE_KEY`: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZWN2aWVmbW5odHRpZ3phbXJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczOTgxMzE4NywiZXhwIjoyMDU1Mzg5MTg3fQ.RWp2aLLK0arOj5enlW7wk6qUL1CqTASYrKvjSHF1QK8

## Optional Environment Variables

- `VITE_OPENAI_API_KEY`: If you're using OpenAI in your application, add your API key here

## How to Add Environment Variables in Vercel

1. Go to your Vercel dashboard
2. Select your project
3. Click on "Settings" tab
4. Click on "Environment Variables" in the left sidebar
5. Add each variable with its corresponding value
6. Make sure to select all deployment environments (Production, Preview, Development) where the variable should be available
7. Click "Save" when done

After adding all environment variables, redeploy your application. 