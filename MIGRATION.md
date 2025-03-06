# Backend to Frontend Migration Guide

This document outlines the steps taken to migrate the backend functionality to the frontend, as well as any remaining tasks.

## Completed Tasks

### Phase 1: Setup Frontend API Clients and Services

- ✅ Created OpenAI client integration for the frontend
- ✅ Created Reddit client integration for the frontend
- ✅ Created OpenRouter client integration for the frontend
- ✅ Created StoryService to handle story generation functionality
- ✅ Created profiles.json to store story profiles
- ✅ Created a hook to use the StoryService in React components
- ✅ Updated environment variables

### Phase 2: Refactor Backend-Dependent Components

- ✅ Updated StoryGenerationModal to use the StoryService
- ✅ Updated Stories page to use the StoryService for fetching and deleting stories
- ✅ Updated AISettings component to handle OpenAI API key
- ✅ Updated Editor component to use the StoryService for loading and saving stories
- ✅ Fixed story generation process to follow the correct order of steps
- ✅ Enhanced title creation with custom title option and story idea viewing
- ✅ Added ability to cancel story generation at any point

### Phase 3: Testing and Optimization

- ✅ Created browser caching utility
- ✅ Implemented caching for story data
- ✅ Optimized API calls

### Phase 4: Cleanup and Deployment

- ✅ Updated README.md with instructions for the frontend-only version
- ✅ Created migration guide
- ✅ Updated package.json to add necessary dependencies from the backend
- ✅ Updated vite.config.ts to remove unnecessary plugins
- ✅ Removed backend code (src/backend directory)
- ✅ Resolved dependency issues with `--legacy-peer-deps` flag
- ✅ Added deployment configurations for Vercel and Netlify
- ✅ Fixed API key handling in StoryService
- ✅ Fixed model selection in StoryService for different functions
- ✅ Added support for both OpenAI and OpenRouter clients based on user settings

## Remaining Tasks

1. **Testing**:
   - Thoroughly test all functionality to ensure it works without the backend
   - Test with real API keys to ensure API calls work correctly

## How to Complete the Migration

1. **Final Testing**:
   - Test the application end-to-end to ensure all functionality works without the backend
   - Test with real API keys to ensure API calls work correctly

## Deployment Instructions

The application can now be deployed to various static hosting services:

### Vercel

1. Connect your GitHub repository to Vercel
2. Vercel will automatically detect the `vercel.json` configuration
3. Set up environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)
4. Deploy

### Netlify

1. Connect your GitHub repository to Netlify
2. Netlify will automatically detect the `netlify.toml` configuration
3. Set up environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)
4. Deploy

### GitHub Pages or Other Static Hosting

1. Build the application locally:
   ```
   npm run build --legacy-peer-deps
   ```
2. Deploy the contents of the `dist` directory to your hosting service

## Notes

- The migration preserves all functionality while removing the need for a backend server
- API keys are stored in the user's settings in Supabase
- All API calls are made directly from the frontend
- Browser caching is used to optimize API calls and reduce costs
- When installing dependencies, use the `--legacy-peer-deps` flag to resolve peer dependency conflicts:
  ```
  npm install --legacy-peer-deps
  ```
- The field name for the OpenAI API key in the user settings is `openai_key` (not `openai_api_key`)
- Model selection in StoryService is based on the function being performed:
  - Story generation: `story_generation_model`
  - Story ideas: `title_fine_tune_model`
  - Title generation: `rewriting_model`
  - Text rewriting: `rewrite_model`
- Client selection in StoryService is based on the `use_openai_for_story_gen` setting:
  - When `true`: Uses OpenAI client with appropriate OpenAI models
  - When `false`: Uses OpenRouter client with appropriate OpenRouter models
- Story generation process follows these steps in order:
  1. Generate story idea
  2. Create title from story idea (with option to view story idea and create custom title)
  3. Generate plot outline
  4. Generate characters
  5. Save story to database and open in editor
- The story generation process can be cancelled at any point, aborting any in-progress API calls 