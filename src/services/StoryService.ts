import { createOpenAIClient, isValidApiKey } from '@/integrations/openai/client';
import { createOpenRouterClient } from '@/integrations/openrouter/client';
import { getTopPosts, filterLongPosts, getRandomPost, type RedditPost } from '@/integrations/reddit/client';
import { userSettingsService } from './UserSettingsService';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { browserCache } from '@/lib/cache';
import { v4 as uuidv4 } from 'uuid';

// Load profiles from a static JSON file
import profilesData from '@/data/profiles.json';

// Settings object with profiles from JSON
const settings = {
  STORY_PROFILE: 'Horror', // Default to Horror category
  NUM_SCENES: 8,
  profiles: profilesData.categories,
  load_story_profiles: function() {
    const profileMap: Record<string, any> = {};
    this.profiles.forEach((profile: any) => {
      profileMap[profile.name] = {
        flair_exclude: profile.flair_exclude || 'Series',
        prompts: profile.prompts,
        system_prompt: profile.system_prompt,
        model: profile.model,
        num_scenes: profile.num_scenes || 8
      };
    });
    return profileMap;
  }
};

// Helper function to replace words or phrases in strings
function replaceWords(text: string): string {
  // Replaces single words & short phrases
  const wordBank: Record<string, string> = {
    'shifted': 'moved',
    'shift': 'change',
    'shifting': 'changing',
    'bravado': 'bravery',
    'loomed': 'appeared',
    // Add more replacements as needed
  };

  const phraseBank: Record<string, string> = {
    'I frowned. ': '',
    ', frowning': '',
    'I frowned and ': 'I',
    // Add more phrase replacements as needed
  };

  // First replace entire phrases:
  Object.entries(phraseBank).forEach(([oldP, newP]) => {
    if (text.includes(oldP)) {
      text = text.split(oldP).join(newP);
    }
  });

  // Then replace individual words with a regex:
  Object.entries(wordBank).forEach(([oldW, newW]) => {
    // Use word boundaries, ignoring case:
    const regex = new RegExp(`\\b${oldW}\\b`, 'gi');
    text = text.replace(regex, newW);
  });

  return text;
}

// Helper function to get ordinal numbers
function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Helper function to generate scene template
function generateSceneTemplate(numScenes: number): string {
  const template = [];
  for (let i = 1; i <= numScenes; i++) {
    template.push({
      scene_number: i,
      scene_beat: `<Write the ${getOrdinal(i)} scene beat here>`
    });
  }
  return JSON.stringify(template, null, 2);
}

export class StoryService {
  private static instance: StoryService;
  private userId: string | null = null;
  private userSettings: any = null;
  private openaiClient: any = null;
  private openrouterClient: any = null;

  private constructor() {}

  public static getInstance(): StoryService {
    if (!StoryService.instance) {
      StoryService.instance = new StoryService();
    }
    return StoryService.instance;
  }

  public setUserId(userId: string) {
    this.userId = userId;
  }

  public async loadUserSettings() {
    if (!this.userId) {
      throw new Error('User ID not set');
    }
    this.userSettings = await userSettingsService.getSettings(this.userId);
    
    // Initialize OpenAI client with API key from user settings
    if (this.userSettings.openai_key && isValidApiKey(this.userSettings.openai_key)) {
      try {
        this.openaiClient = createOpenAIClient(this.userSettings.openai_key);
      } catch (error) {
        console.error('Failed to initialize OpenAI client:', error);
        this.openaiClient = null;
      }
    }
    
    // Initialize OpenRouter client with API key from user settings
    if (this.userSettings.openrouter_key && isValidApiKey(this.userSettings.openrouter_key)) {
      try {
        this.openrouterClient = createOpenRouterClient(this.userSettings.openrouter_key);
      } catch (error) {
        console.error('Failed to initialize OpenRouter client:', error);
        this.openrouterClient = null;
      }
    }
    
    return this.userSettings;
  }

  private getOpenAIClient() {
    if (!this.openaiClient) {
      if (!this.userSettings || !this.userSettings.openai_key) {
        throw new Error('OpenAI API key not set in user settings');
      }
      this.openaiClient = createOpenAIClient(this.userSettings.openai_key);
    }
    return this.openaiClient;
  }

  private getOpenRouterClient() {
    if (!this.openrouterClient) {
      if (!this.userSettings || !this.userSettings.openrouter_key) {
        throw new Error('OpenRouter API key not set in user settings');
      }
      this.openrouterClient = createOpenRouterClient(this.userSettings.openrouter_key);
    }
    return this.openrouterClient;
  }

  // Get the appropriate client based on user settings
  private getClient() {
    if (this.userSettings.use_openai_for_story_gen) {
      return this.getOpenAIClient();
    } else {
      return this.getOpenRouterClient();
    }
  }

  // Generate story ideas from Reddit posts
  public async generateStoryIdea(): Promise<string> {
    try {
      if (!this.userSettings) {
        await this.loadUserSettings();
      }

      // Get top posts from r/nosleep
      console.log('Searching for top posts on r/nosleep...');
      const topPosts = await getTopPosts('nosleep', 'all', 100);
      
      // Filter posts: >20,000 characters, no "Series" flair
      const eligiblePosts = filterLongPosts(topPosts, 20000, 'Series');
      
      if (eligiblePosts.length === 0) {
        console.log('No eligible posts found. Falling back to default story idea generation.');
        // Fall back to original method
        const allProfiles = settings.load_story_profiles();
        const profile = allProfiles[settings.STORY_PROFILE];
        
        if (!profile) {
          console.log(`Error: Story profile '${settings.STORY_PROFILE}' not found`);
          return 'Failed to generate story idea';
        }

        const prompt = profile.prompts[Math.floor(Math.random() * profile.prompts.length)];
        console.log('Using prompt:', prompt);

        // Get the appropriate client based on user settings
        const client = this.getClient();
        
        // Use the title_fine_tune_model for story idea generation
        const model = this.userSettings.use_openai_for_story_gen 
          ? this.userSettings.title_fine_tune_model || 'gpt-4o'
          : this.userSettings.openrouter_model || 'openai/gpt-4o-mini';
        
        console.log(`Using ${this.userSettings.use_openai_for_story_gen ? 'OpenAI' : 'OpenRouter'} with model: ${model} for story idea generation`);
        
        const response = await client.chat.completions.create({
          model: model,
          messages: [
            { 
              role: "system", 
              content: profile.system_prompt 
            },
            { 
              role: "user", 
              content: prompt 
            }
          ],
          temperature: 0.9,
          max_tokens: 500
        });

        return response.choices[0].message.content || 'Failed to generate story idea';
      }
      
      // Select a random post from eligible posts
      const randomPost = getRandomPost(eligiblePosts);
      if (!randomPost) {
        throw new Error('Failed to select a random post');
      }
      
      console.log(`Selected post: "${randomPost.title}" (${randomPost.selftext.length} characters)`);
      
      // Generate a detailed summary of the post
      const summaryPrompt = `
I need a detailed summary of the following horror story from r/nosleep. 
Create a comprehensive summary that captures the key plot points, atmosphere, and horror elements.
The summary should be detailed enough to serve as inspiration for a new horror story, but should not be a direct copy.
Focus on the core narrative, key events, and the horror elements that make this story effective.

Story Title: ${randomPost.title}

Story Content:
${randomPost.selftext.substring(0, 15000)} // Limit to 15000 chars in case the story is very long

Please provide a detailed summary in 400-600 words.
`;

      // Get the appropriate client based on user settings
      const client = this.getClient();
      
      // Use the appropriate model for Reddit post summarization
      const model = this.userSettings.use_openai_for_story_gen
        ? this.userSettings.story_generation_model || 'gpt-4o'
        : this.userSettings.openrouter_model || 'openai/gpt-4o-mini';
      
      console.log(`Using ${this.userSettings.use_openai_for_story_gen ? 'OpenAI' : 'OpenRouter'} with model: ${model} for Reddit post summarization`);
      
      const summaryResponse = await client.chat.completions.create({
        model: model,
        messages: [
          { 
            role: "system", 
            content: "You are an expert at analyzing and summarizing horror stories. Your summaries capture the essence of the original while highlighting the most impactful elements." 
          },
          { 
            role: "user", 
            content: summaryPrompt 
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      const summary = summaryResponse.choices[0].message.content || '';
      
      // Add attribution and format the response
      return `Story Idea based on r/nosleep post "${randomPost.title}" by u/${randomPost.author}:\n\n${summary}`;
      
    } catch (err) {
      console.error("Error generating story idea from Reddit:", err);
      console.log("Falling back to default story idea generation...");
      
      // Fall back to original method if Reddit fails
      try {
        const allProfiles = settings.load_story_profiles();
        const profile = allProfiles[settings.STORY_PROFILE];
        
        if (!profile) {
          console.log(`Error: Story profile '${settings.STORY_PROFILE}' not found`);
          return 'Failed to generate story idea';
        }

        const prompt = profile.prompts[Math.floor(Math.random() * profile.prompts.length)];
        console.log('Using prompt:', prompt);

        // Get the appropriate client based on user settings
        const client = this.getClient();
        
        // Use the title_fine_tune_model for story idea generation
        const model = this.userSettings.use_openai_for_story_gen 
          ? this.userSettings.title_fine_tune_model || 'gpt-4o'
          : this.userSettings.openrouter_model || 'openai/gpt-4o-mini';
        
        console.log(`Using ${this.userSettings.use_openai_for_story_gen ? 'OpenAI' : 'OpenRouter'} with model: ${model} for story idea generation`);
        
        const response = await client.chat.completions.create({
          model: model,
          messages: [
            { 
              role: "system", 
              content: profile.system_prompt 
            },
            { 
              role: "user", 
              content: prompt 
            }
          ],
          temperature: 0.9,
          max_tokens: 500
        });

        return response.choices[0].message.content || 'Failed to generate story idea';
      } catch (fallbackErr) {
        console.error("Error in fallback story idea generation:", fallbackErr);
        return 'Failed to generate story idea';
      }
    }
  }

  // Format scenes from JSON string
  public formatScenes(inputString: string): string[] | null {
    try {
      // Clean code blocks
      inputString = inputString.replace(/```json\s*|\s*```/g, '').trim();
      
      // Find the first occurrence of '[' to get the start of the JSON array
      const jsonStartIndex = inputString.indexOf('[');
      if (jsonStartIndex !== -1) {
        // Remove any text before the JSON array
        inputString = inputString.substring(jsonStartIndex);
      }

      const scenesArr = JSON.parse(inputString);

      const formattedScenes: string[] = [];
      for (const scene of scenesArr) {
        const sceneNumber = scene.scene_number;
        const sceneBeat = scene.scene_beat;
        if (sceneNumber != null && sceneBeat) {
          formattedScenes.push(sceneBeat.trim());
        }
      }
      if (!formattedScenes.length) {
        console.log("Warning: No scenes were parsed from JSON");
        return null;
      }
      return formattedScenes;
    } catch (err) {
      console.log("Warning: Failed to parse JSON in formatScenes:", err);
      return null;
    }
  }

  // Create outline from story idea
  public async createOutline(idea: string): Promise<string[] | null> {
    try {
      if (!this.userSettings) {
        await this.loadUserSettings();
      }

      const allProfiles = settings.load_story_profiles();
      const profile = allProfiles[settings.STORY_PROFILE];
      
      if (!profile) {
        console.log(`Error: Story profile '${settings.STORY_PROFILE}' not found`);
        return null;
      }

      const numScenes = profile.num_scenes || settings.NUM_SCENES;
      let retries = 0;
      
      while (retries < 5) {
        try {
          const userMessage = `
## Instructions
Write a full plot outline for the given story idea.
Write the plot outline as a list of all the scenes in the story. Each scene must be a highly detailed paragraph on what happens in that scene.
Each scene beat must include as much detail as you can about the events that happen in the scene.
Explicitly state the change of time between scenes if necessary.
Mention any locations by name.
Create a slow build up of tension and suspense throughout the story.
A scene in the story is defined as when there is a change in the setting in the story.
The plot outline must contain ${numScenes} scenes.
The plot outline must follow and word things in a way that are from the protagonist's perspective, do not write anything from an outside character's perspective that the protagonist wouldn't know.
Only refer to the protagonist in the story as "The Protagonist" in the plot outline.
Each scene must smoothly transition from the previous scene and to the next scene without unexplained time and setting jumps.
Ensure key story elements (e.g., character motivations, mysteries, and plot developments) are resolved by the end.
Explicitly address and resolve the purpose and origin of central objects or plot devices (e.g., mysterious items, symbols, or events).
If other characters have significant knowledge of the mystery or key events, show how and when they gained this knowledge to maintain logical consistency.
Explore and resolve character dynamics, especially those affecting key relationships.
Provide clarity on thematic or mysterious elements that connect scenes, ensuring the stakes are clearly defined and resolved.
The final scene beat must state it's the final scene beat of the story and how to end the story.

## You must use following json format for the plot outline exactly without deviation:
${generateSceneTemplate(numScenes)}

## Story Idea:
${idea}`;

          // Get the appropriate client based on user settings
          const client = this.getClient();
          
          // Use the story_generation_model for outline creation
          const model = this.userSettings.use_openai_for_story_gen 
            ? this.userSettings.story_generation_model || 'gpt-4o'
            : this.userSettings.openrouter_model || 'openai/gpt-4o-mini';
          
          console.log(`Using ${this.userSettings.use_openai_for_story_gen ? 'OpenAI' : 'OpenRouter'} with model: ${model} for outline creation`);
          
          const response = await client.chat.completions.create({
            model: model,
            temperature: 0.5,
            messages: [{ role: "user", content: userMessage }]
          });
          const text = response.choices[0].message.content || '';

          console.log("Plot outline:", text);

          const outline = this.formatScenes(text);
          if (!outline) {
            console.log("Error: Empty outline generated.");
            retries += 1;
            continue;
          }
          return outline;

        } catch (err) {
          console.error(`Error in createOutline: ${err}. Retrying...`);
          retries += 1;
        }
      }
      console.log("Failed to create outline after 5 attempts.");
      return null;
    } catch (err) {
      console.error("Error loading profile:", err);
      return null;
    }
  }

  // Generate characters for the story
  public async generateCharacters(outline: string[]): Promise<string | null> {
    let retries = 0;
    while (retries < 10) {
      try {
        if (!this.userSettings) {
          await this.loadUserSettings();
        }

        const prompt = `
## Instructions

Using the given story outline, write short character descriptions for all the characters in the story in the following format:
<character name='(Character Name)' aliases='(Character Alias)', pronouns='(Character Pronouns)'>Personality, appearance, and other details</character>

The character alias is what the other characters in the story will call that character in the story such as their first name.
For the Protagonist's alias you must create a name that other characters will call them in the story.
The pronouns are what you will use to refer to the character as in the story when not writing their name.
The character description must only describe their appearance and personality DO NOT write what happens to them in the story.
Only return the character descriptions without any comments.

## Outline:
${outline.join('\n')}
        `;
        
        // Get the appropriate client based on user settings
        const client = this.getClient();
        
        // Use the story_generation_model for character generation
        const model = this.userSettings.use_openai_for_story_gen 
          ? this.userSettings.story_generation_model || 'gpt-4o'
          : this.userSettings.openrouter_model || 'openai/gpt-4o-mini';
        
        console.log(`Using ${this.userSettings.use_openai_for_story_gen ? 'OpenAI' : 'OpenRouter'} with model: ${model} for character generation`);
        
        const response = await client.chat.completions.create({
          model: model,
          max_tokens: 4000,
          temperature: 0.7,
          messages: [{ role: "user", content: prompt }]
        });
        return response.choices[0].message.content || null;
      } catch (err) {
        console.log(`Error in generateCharacters: ${err}. Retrying...`);
        retries += 1;
      }
    }
    return null;
  }

  // Process text in smaller chunks
  public async rewriteInChunks(text: string): Promise<string> {
    if (!this.userSettings) {
      await this.loadUserSettings();
    }

    // Split text into paragraphs
    const paragraphs = text.split('\n\n').filter(p => p.trim());
    const chunks = [];
    let currentChunk = [];
    const processedChunks = [];

    // Group paragraphs into chunks of 3 or less
    for (const paragraph of paragraphs) {
      currentChunk.push(paragraph);
      if (currentChunk.length === 3) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
      }
    }

    // Add any remaining paragraphs
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
    }

    // Process each chunk
    for (const chunk of chunks) {
      try {
        // Get the appropriate client based on user settings
        const client = this.getClient();
        
        // Use the rewrite_model for text rewriting
        const model = this.userSettings.use_openai_for_story_gen 
          ? this.userSettings.rewrite_model || 'gpt-4o'
          : this.userSettings.openrouter_model || 'openai/gpt-4o-mini';
        
        console.log(`Using ${this.userSettings.use_openai_for_story_gen ? 'OpenAI' : 'OpenRouter'} with model: ${model} for text rewriting`);

        const response = await client.chat.completions.create({
          model: model,
          messages: [
            {
              role: "user",
              content: `Remove all appositive phrases relating to people or objects in the given text, except those that contain foreshadowing.
Remove all absolute phrases relating to people or objects in the given text, except those that provide sensory information or describe physical sensations.
Remove all metaphors in the given text.
Remove any sentences that add unnecessary detail or reflection without contributing new information to the scene.
Remove any sentences that hinder the pacing of the scene by adding too many descriptions about the scene.
Remove any phrases that mention the character's heart pounding or heart in their throat.

If a paragraph doesn't need to be changed then just leave it as is in the returned text.

Only respond with the modified text and nothing else.

Text to edit:
${chunk}`
            }
          ],
          temperature: 0.5
        });

        processedChunks.push(response.choices[0].message.content || chunk);
      } catch (err) {
        console.error('Error processing chunk:', err);
        // On error, keep original chunk to maintain story continuity
        processedChunks.push(chunk);
      }
    }

    // Combine all processed chunks with double newlines
    return processedChunks.join('\n\n');
  }

  // Create a title for the story
  public async createTitle(storyText: string): Promise<string> {
    if (!this.userSettings) {
      await this.loadUserSettings();
    }

    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get the appropriate client based on user settings
        const client = this.getClient();
        
        // Use the rewriting_model for title generation
        const model = this.userSettings.use_openai_for_story_gen 
          ? this.userSettings.rewriting_model || 'gpt-4o'
          : this.userSettings.openrouter_model || 'openai/gpt-4o-mini';
        
        console.log(`Using ${this.userSettings.use_openai_for_story_gen ? 'OpenAI' : 'OpenRouter'} with model: ${model} for title generation`);
        
        const title = await client.chat.completions.create({
          model: model,
          max_tokens: 4000,
          messages: [
            {
              role: "system",
              content: "You are tasked with creating a YouTube title for the given story. The title must be between 70 and 100 characters and include a comma. The title must be told in first person in the past tense."
            },
            {
              role: "user",
              content: storyText
            }
          ]
        });

        let titleText = title.choices[0].message.content?.replace(/"/g, '') || '';

        if (storyText.includes('Horror') && !titleText.includes(',')) {
          titleText = titleText.replace(' ', ', ', 1);
        }

        if (titleText.length <= 100 && titleText.length >= 70 && titleText.includes(',')) {
          console.log(`Generated title: ${titleText}`);
          return titleText;
        }

        if (attempt === maxRetries - 1) {
          console.log(`Warning: Could not generate valid title after ${maxRetries} attempts. Truncating...`);
          return titleText.slice(0, 97) + "...";
        }

      } catch (error) {
        console.error(`Error on attempt ${attempt + 1}:`, error);
        if (attempt === maxRetries - 1) {
          throw error;
        }
      }
    }
    
    throw new Error('Failed to generate a valid title after all attempts');
  }

  // Get all stories for a user
  public async getUserStories(): Promise<any[]> {
    if (!this.userId) {
      throw new Error('User ID not set');
    }

    try {
      // Check cache first
      const cacheKey = `user_stories_${this.userId}`;
      const cachedStories = browserCache.get<any[]>(cacheKey);
      
      if (cachedStories) {
        console.log('Using cached stories');
        return cachedStories;
      }

      // Fetch from Supabase if not in cache
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Cache the results
      browserCache.set(cacheKey, data || []);
      
      return data || [];
    } catch (error) {
      console.error('Error getting user stories:', error);
      throw error;
    }
  }

  // Get story by ID
  public async getStory(storyId: string): Promise<any> {
    try {
      // Check cache first
      const cacheKey = `story_${storyId}`;
      const cachedStory = browserCache.get<any>(cacheKey);
      
      if (cachedStory) {
        console.log('Using cached story');
        return cachedStory;
      }

      // Fetch from Supabase if not in cache
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('id', storyId)
        .single();

      if (error) throw error;
      
      // Cache the results
      browserCache.set(cacheKey, data);
      
      return data;
    } catch (error) {
      console.error('Error getting story:', error);
      throw error;
    }
  }

  // Save story to Supabase
  public async saveStory(story: any): Promise<string> {
    if (!this.userId) {
      throw new Error('User ID not set');
    }

    try {
      // Generate a UUID for the story
      const storyId = uuidv4();
      
      // Ensure all required fields are present and properly formatted
      const storyData = {
        id: storyId,
        title: story.title || 'Untitled Story',
        story_idea: story.story_idea || '',
        plot_outline: typeof story.plot_outline === 'string' 
          ? story.plot_outline 
          : JSON.stringify(story.plot_outline || []),
        characters: story.characters || '',
        chapters: typeof story.chapters === 'string'
          ? story.chapters
          : JSON.stringify(story.chapters || []),
        user_id: this.userId
      };

      console.log('Saving story with data:', storyData);

      const { data, error } = await supabase
        .from('stories')
        .insert([storyData])
        .select();

      if (error) {
        console.error('Supabase error details:', error);
        throw new Error(`Failed to save story: ${error.message}`);
      }
      
      if (!data || data.length === 0) {
        throw new Error('No data returned after saving story');
      }
      
      // Invalidate the user stories cache
      browserCache.remove(`user_stories_${this.userId}`);
      
      return data[0].id;
    } catch (error: any) {
      console.error('Error saving story:', error);
      throw new Error(`Error saving story: ${error.message || 'Unknown error'}`);
    }
  }

  // Update story in Supabase
  public async updateStory(storyId: string, updates: any): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('stories')
        .update(updates)
        .eq('id', storyId)
        .select();

      if (error) throw error;
      
      // Invalidate the story cache
      browserCache.remove(`story_${storyId}`);
      
      // If the user's stories are cached, invalidate that too
      if (this.userId) {
        browserCache.remove(`user_stories_${this.userId}`);
      }
      
      return data[0];
    } catch (error) {
      console.error('Error updating story:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export const storyService = StoryService.getInstance(); 