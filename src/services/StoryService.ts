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
import openai from 'openai';

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
        console.error('OpenRouter API key not set in user settings');
        throw new Error('OpenRouter API key not set in user settings');
      }
      this.openrouterClient = createOpenRouterClient(this.userSettings.openrouter_key);
    }
    return this.openrouterClient;
  }

  // Get the appropriate client based on user settings
  private getClient() {
    console.log('getClient called, use_openai_for_story_gen:', this.userSettings.use_openai_for_story_gen);
    if (this.userSettings.use_openai_for_story_gen) {
      console.log('Using OpenAI client');
      return this.getOpenAIClient();
    } else {
      console.log('Using OpenRouter client');
      return this.getOpenRouterClient();
    }
  }

  // Validate model format based on provider
  private validateModel(model: string, isOpenAI: boolean): boolean {
    console.log(`Validating model: ${model} for ${isOpenAI ? 'OpenAI' : 'OpenRouter'}`);
    
    if (!model) {
      console.error('Model name is empty');
      return false;
    }
    
    if (isOpenAI) {
      // OpenAI models typically start with "gpt-"
      const isValid = model.startsWith('gpt-');
      console.log(`OpenAI model validation result: ${isValid}`);
      return isValid;
    } else {
      // OpenRouter models should either include a provider prefix (contain '/') 
      // or be a valid model ID
      const isValid = model.includes('/') || model.length > 0;
      console.log(`OpenRouter model validation result: ${isValid}`);
      return isValid;
    }
  }

  // Ensure the model has the correct format for the provider
  private getFormattedModel(model: string, isOpenAI: boolean): string {
    if (isOpenAI) {
      // For OpenAI, just return the model as is
      return model;
    } else {
      // For OpenRouter, ensure it has a provider prefix
      if (model.includes('/')) {
        // Already has a provider prefix
        return model;
      } else {
        // Add a default provider prefix if none exists
        // Common models like gpt-4o-mini might need a provider prefix
        if (model.startsWith('gpt-')) {
          return `openai/${model}`;
        }
        // For other models, just return as is
        return model;
      }
    }
  }

  // Generate story ideas from Reddit posts or fine-tuned model
  public async generateStoryIdea(signal?: AbortSignal, source: 'reddit' | 'fine-tune' = 'reddit'): Promise<string> {
    try {
      if (!this.userSettings) {
        await this.loadUserSettings();
      }

      // If source is fine-tune, use the fine-tuned model directly
      if (source === 'fine-tune') {
        return this.generateStoryIdeaFromFineTune(signal);
      }

      // Otherwise, use Reddit as the source (default behavior)
      // Get top posts from r/nosleep
      console.log('Searching for top posts on r/nosleep...');
      const topPosts = await getTopPosts('nosleep', 'month', 100);
      
      // Filter posts: >20,000 characters, no "Series" flair
      const eligiblePosts = filterLongPosts(topPosts, 20000, 'Series');
      
      if (eligiblePosts.length === 0) {
        console.log('No eligible posts found. Falling back to default story idea generation.');
        // Fall back to original method
        return this.generateStoryIdeaFromFineTune(signal);
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
Create a comprehensive summary about the story with as much detail as possible, focus on the plot and events in the story with minimal dialogue.
The summary should be completely new and different from the given story to avoid copyright issues.
You MUST change the characters, locations, and events to create a new story that is based on the original story but is not a direct copy.
Focus on the core narrative, key events, and the horror elements that make this story effective when writing the new story summary.
DO NOT write any comments, only write the summary.

Story Content:
${randomPost.selftext}

Please provide a detailed summary in 400-600 words.
`;

      // Get the appropriate client based on user settings
      const client = this.getClient();
      
      // Use the appropriate model for Reddit post summarization
      const model = this.userSettings.use_openai_for_story_gen
        ? this.userSettings.reasoning_model || 'gpt-4o'
        : this.userSettings.reasoning_model || 'anthropic/claude-3.7-sonnet:thinking';
      
      console.log(`Using ${this.userSettings.use_openai_for_story_gen ? 'OpenAI' : 'OpenRouter'} with model: ${model} for Reddit post summarization`);
      
      const summaryResponse = await client.chat.completions.create({
        model: model,
        messages: [
          { 
            role: "user", 
            content: summaryPrompt 
          }
        ],
        temperature: 0.7
      });

      const summary = summaryResponse.choices[0].message.content || '';
      
      // Add attribution and format the response
      return `Story Idea based on r/nosleep post "${randomPost.title}" by u/${randomPost.author}:\n\n${summary}`;
      
    } catch (err) {
      console.error("Error generating story idea from Reddit:", err);
      console.log("Falling back to default story idea generation...");
      
      // Fall back to original method if Reddit fails
      return this.generateStoryIdeaFromFineTune(signal);
    }
  }

  // Generate story idea from fine-tuned model
  private async generateStoryIdeaFromFineTune(signal?: AbortSignal): Promise<string> {
    try {
      if (!this.userSettings) {
        await this.loadUserSettings();
      }

      const allProfiles = settings.load_story_profiles();
      const profile = allProfiles[settings.STORY_PROFILE];
      
      if (!profile) {
        console.log(`Error: Story profile '${settings.STORY_PROFILE}' not found`);
        return 'Failed to generate story idea';
      }

      const prompt = profile.prompts[Math.floor(Math.random() * profile.prompts.length)];
      console.log('Using prompt:', prompt);

      // Get the appropriate client based on user settings
      const client = this.getOpenAIClient();
      
      // Use the story_idea_model for story idea generation if available, otherwise fall back to appropriate defaults
      const model = this.userSettings.story_idea_model || this.userSettings.story_generation_model
      
      console.log(`Using OpenAI with model: ${model} for story idea generation`);
      
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
        temperature: 0.5
      }, {
        signal: signal
      });

      return response.choices[0].message.content || 'Failed to generate story idea';
    } catch (fallbackErr) {
      console.error("Error in fallback story idea generation:", fallbackErr);
      return 'Failed to generate story idea';
    }
  }

  // Create a story from a custom idea
  public async createStoryFromCustomIdea(customIdea: string, signal?: AbortSignal): Promise<string> {
    try {
      if (!this.userSettings) {
        await this.loadUserSettings();
      }

      // Step 1: Create title from custom story idea
      const title = await this.createTitle(customIdea, signal);
      
      // Step 2: Create outline from custom story idea
      const outline = await this.createOutline(customIdea, signal);
      
      if (!outline) {
        throw new Error('Failed to create outline');
      }
      
      // Step 3: Generate characters
      const characters = await this.generateCharacters(outline, signal);
      
      if (!characters) {
        throw new Error('Failed to generate characters');
      }
      
      // Step 4: Create the story data
      const storyData = {
        title,
        story_idea: customIdea,
        plot_outline: JSON.stringify(outline),
        characters,
        chapters: outline.map((sceneBeat, index) => ({
          title: `Chapter ${index + 1}`,
          content: '',
          completed: false,
          sceneBeat
        }))
      };
      
      // Step 5: Save the story
      const storyId = await this.saveStory(storyData);
      
      return storyId;
    } catch (error) {
      console.error('Error creating story from custom idea:', error);
      throw new Error('Failed to create story from custom idea. Please try again.');
    }
  }

  // Format scenes from JSON string
  public formatScenes(inputString: string): string[] | null {
    try {
      console.log("Raw input to formatScenes:", inputString.substring(0, 100) + "...");
      
      // Clean code blocks
      inputString = inputString.replace(/```json\s*|\s*```/g, '').trim();
      
      // Find the first occurrence of '[' to get the start of the JSON array
      const jsonStartIndex = inputString.indexOf('[');
      if (jsonStartIndex !== -1) {
        // Remove any text before the JSON array
        inputString = inputString.substring(jsonStartIndex);
      }

      // Find the last occurrence of ']' to get the end of the JSON array
      const jsonEndIndex = inputString.lastIndexOf(']');
      if (jsonEndIndex !== -1 && jsonEndIndex < inputString.length - 1) {
        // Remove any text after the JSON array
        inputString = inputString.substring(0, jsonEndIndex + 1);
      }
      
      // Additional sanitization to fix common JSON issues
      // Replace any unescaped quotes within string values
      inputString = this.sanitizeJsonString(inputString);
      
      console.log("Sanitized JSON:", inputString.substring(0, 100) + "...");
      
      let scenesArr;
      try {
        // Try to parse the JSON
        scenesArr = JSON.parse(inputString);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        
        // If parsing fails, try a more aggressive approach to extract scene data
        console.log("Attempting to extract scene data manually...");
        return this.extractScenesManually(inputString);
      }

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
      
      console.log(`Successfully parsed ${formattedScenes.length} scenes`);
      return formattedScenes;
    } catch (err) {
      console.log("Warning: Failed to parse JSON in formatScenes:", err);
      return null;
    }
  }
  
  // Helper method to sanitize JSON string
  private sanitizeJsonString(jsonString: string): string {
    // This is a simplified sanitizer that handles common JSON formatting issues
    
    // Replace unescaped quotes within string values
    // This regex looks for quotes between quotes that aren't escaped
    let result = jsonString;
    
    // First, let's handle any potential control characters that might be invalid in JSON
    result = result.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    
    // Try to fix unescaped quotes in a way that preserves the structure
    // This is complex to do perfectly with regex, so we'll use a simplified approach
    
    // Replace instances where there might be nested quotes
    result = result.replace(/: ?"([^"]*)"([^"]*)"([^"]*)"/g, ': "$1\'$2\'$3"');
    
    return result;
  }
  
  // Fallback method to extract scenes when JSON parsing fails
  private extractScenesManually(text: string): string[] | null {
    try {
      console.log("Attempting manual scene extraction...");
      
      // Look for scene_beat patterns
      const sceneRegex = /"scene_beat"\s*:\s*"([^"]*)"/g;
      const scenes: string[] = [];
      let match;
      
      while ((match = sceneRegex.exec(text)) !== null) {
        if (match[1] && match[1].trim()) {
          scenes.push(match[1].trim());
        }
      }
      
      // If we found scenes, return them
      if (scenes.length > 0) {
        console.log(`Manually extracted ${scenes.length} scenes`);
        return scenes;
      }
      
      // If the regex approach failed, try a more aggressive line-by-line approach
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('"scene_beat"') && i + 1 < lines.length) {
          // Extract the content after "scene_beat":
          const content = line.split('"scene_beat"')[1].trim();
          if (content.startsWith(':')) {
            // Get the content after the colon
            let sceneBeat = content.substring(1).trim();
            // Remove starting and ending quotes if present
            if (sceneBeat.startsWith('"')) {
              sceneBeat = sceneBeat.substring(1);
            }
            if (sceneBeat.endsWith('"') || sceneBeat.endsWith('",')) {
              sceneBeat = sceneBeat.replace(/",?$/, '');
            }
            if (sceneBeat) {
              scenes.push(sceneBeat);
            }
          }
        }
      }
      
      if (scenes.length > 0) {
        console.log(`Extracted ${scenes.length} scenes using line-by-line approach`);
        return scenes;
      }
      
      // If all else fails, try to extract any text that looks like a scene description
      const paragraphs = text.split(/\n\s*\n/);
      for (const paragraph of paragraphs) {
        // Look for paragraphs that might be scene descriptions
        // They typically mention the narrator and have substantial content
        if (paragraph.includes('(The Narrator)') && paragraph.length > 100) {
          scenes.push(paragraph.trim());
        }
      }
      
      if (scenes.length > 0) {
        console.log(`Extracted ${scenes.length} scenes by looking for narrator mentions`);
        return scenes;
      }
      
      console.log("Failed to extract scenes manually");
      return null;
    } catch (err) {
      console.error("Error in manual scene extraction:", err);
      return null;
    }
  }

  // Create outline from story idea
  public async createOutline(idea: string, signal?: AbortSignal): Promise<string[] | null> {
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
          const userMessage = `## OUTLINE REQUIREMENTS
- The plot outline must contain between 4 and 6 chapters, these are STRICT requirements.
- DO NOT create more than 6 chapters under any circumstances.
- DO NOT create 8 chapters - this is explicitly prohibited.
- If there are plot holes in the story idea, you MUST fix them in the plot outline.

## Instructions
- Write a full plot outline for the given story idea.
- Write the plot outline as a list of all the chapters in the story.
- Each chapter must be a detailed summary of the events in that chapter that is 250 words in length.
- DO NOT use flowery language, use concise language.
- Only write the crucial events in the chapter without ANY filler sentences or details.
- Use casual language and tone in the plot outline.
- ONLY write the plot outline in the past tense from the narrator's perspective in third person.
- Explicitly state the change of time and/or setting between chapters.
- Mention any locations by name.
- Only refer to the narrator in the story as their name with (The Narrator) next to it in the plot outline.
- Create a slow build up of tension and suspense throughout the story.
- A chapter in the story is defined as when there is a change in the setting in the story.

# Plot Outline Rules:
- Each chapter must smoothly transition from the previous chapter and to the next chapter without unexplained time and setting jumps.
- Ensure key story elements (e.g., character motivations, mysteries, and plot developments) are resolved by the end.
- Explicitly address and resolve the purpose and origin of central objects or plot devices (e.g., mysterious items, symbols, or events).
- If other characters have significant knowledge of the mystery or key events, show how and when they gained this knowledge to maintain logical consistency.
- Explore and resolve character dynamics, especially those affecting key relationships.
- Provide clarity on thematic or mysterious elements that connect scenes, ensuring the stakes are clearly defined and resolved.
- The final chapter must state it's the final chapter of the story and how to end the story.

## You must use following json format for the plot outline exactly without deviation:
${generateSceneTemplate(numScenes)}

## Story Idea:
${idea}`;

          // Get the appropriate client based on user settings
          const client = this.getClient();
          
          // Use the story_generation_model for outline creation
          const model = this.userSettings.use_openai_for_story_gen 
            ? this.userSettings.reasoning_model || 'gpt-4o'
            : this.userSettings.reasoning_model || 'anthropic/claude-3.7-sonnet:thinking';
          
          console.log(`Using ${this.userSettings.use_openai_for_story_gen ? 'OpenAI' : 'OpenRouter'} with model: ${model} for outline creation`);
          
          const response = await client.chat.completions.create({
            model: model,
            temperature: 0.5,
            messages: [{ role: "user", content: userMessage }],
          }, {
            signal: signal
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
  public async generateCharacters(outline: string[], signal?: AbortSignal): Promise<string | null> {
    let retries = 0;
    while (retries < 10) {
      try {
        if (!this.userSettings) {
          await this.loadUserSettings();
        }

        const prompt = `
## Instructions
Using the given story outline, write short character descriptions for all the characters in the story in the following format:
<character name='(Character Name)' aliases='(Character Alias)', pronouns='(Character Pronouns)', age='(Character Age)'>Personality:\n(Personality)\n\nAppearance:\n(Appearance)\n\nRelationships to other characters:\n(Relationships)</character>

## Character Description rules: 
- The character alias is what the other characters in the story will call that character in the story such as their first name.
- For The Narrator's alias you must create a name that other characters will call them in the story.
- The pronouns are what you will use to refer to the character as in the story when not writing their name.
- The character description must only describe their appearance and personality DO NOT write what happens to them in the story.
- Only return the character descriptions without any comments.

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
          messages: [{ role: "user", content: prompt }],
        }, {
          signal: signal
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
  public async rewriteInChunks(
    text: string,
    onProgress?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    try {
      if (!this.userSettings) {
        await this.loadUserSettings();
      }

      const client = this.getOpenRouterClient();
      const model = this.userSettings.story_generation_model;

      console.log('Starting chapter rewrite with model:', model);

      const stream = await client.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: `##INSTRUCTIONS
You will be given a section of text and you MUST perform the following to it:

-Eliminate all appositive phrases relating to people or objects, except those that contain foreshadowing.
-Eliminate all absolute phrases relating to people or objects, except those that provide sensory information or describe physical sensations.
-Eliminate all metaphors in the text.
-Eliminate all sentences that add unnecessary detail or reflection without contributing new information to the scene.
-Eliminate all sentences that hinder the pacing of the scene by adding excessive descriptions of the environment, atmosphere, or setting unless they directly affect character actions or emotions.
-Eliminate all phrases that mention the character's heart pounding or heart in their throat.
If a paragraph doesn’t need to be changed, leave it as is in the returned text.
-Eliminate all sentences and phrases that mention light casting long shadows.
- Re-word any sentences or phrases that have "I frowned" in them or similar wording.

##WORDS TO REPLACE
#Replace the following words with synonyms that are casual and simple.

#Words:
- Loomed
- Sinewy
- Foreboding
- Grotesque
- Familiar
- Shift/Shifting/Shifted
- Gaze


Only respond with the modified text and nothing else.`
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 1,
        stream: true
      }, {
        signal
      });

      let fullContent = '';

      // Process the stream
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          // Call the progress callback if provided
          if (onProgress) {
            onProgress(content);
          }
        }
      }

      return fullContent || text; // Return original text if rewrite fails
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Chapter rewrite aborted');
        throw err;
      }
      console.error('Error rewriting chapter:', err);
      return text; // Return original text on error
    }
  }

  // Create a title for the story
  public async createTitle(storyText: string, signal?: AbortSignal): Promise<string> {
    if (!this.userSettings) {
      await this.loadUserSettings();
    }

    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get the appropriate client based on user settings
        const client = this.getOpenAIClient();
        
        // Use the title_fine_tune_model for title generation if available, otherwise fall back to appropriate defaults
        const model = this.userSettings.title_fine_tune_model
        
        console.log(`Using OpenAI with model: ${model} for title generation`);
        
        const title = await client.chat.completions.create({
          model: model,
          temperature: 0.9,
          messages: [
            {
              role: "system",
              content: "You are tasked with creating a YouTube title for the given story. The title must be between 70 and 100 characters and include a comma. The title must be told in first person in the past tense."
            },
            {
              role: "user",
              content: `${storyText}`
            }
          ]
        }, {
          signal: signal
        });

        let titleText = title.choices[0].message.content?.trim() || '';
        
        // Remove any quotes that might be in the response
        titleText = titleText.replace(/["']/g, '');
        
        // Remove any trailing punctuation
        titleText = titleText.replace(/[.!?]$/, '');
        
        console.log(`Generated title: ${titleText}`);
        
        // If we got a valid title, return it
        if (titleText && titleText.length > 0 && titleText.length <= 100) {
          return titleText;
        }

        if (attempt === maxRetries - 1) {
          // If we've tried the maximum number of times, just return a default title
          return "Untitled Story";
        }
      } catch (error: any) {
        console.error(`Error generating title (attempt ${attempt + 1}):`, error);
        
        if (attempt === maxRetries - 1) {
          // If we've tried the maximum number of times, just return a default title
          return "Untitled Story";
        }
        
        // If it's an abort error, rethrow it
        if (error.name === 'AbortError') {
          throw error;
        }
        
        // Otherwise, wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Fallback title if all else fails
    return "Untitled Story";
  }

  // Get all stories for a user
  public async getUserStories(forceRefresh: boolean = false): Promise<any[]> {
    if (!this.userId) {
      throw new Error('User ID not set');
    }

    try {
      // Check cache first (unless force refresh is requested)
      const cacheKey = `user_stories_${this.userId}`;
      const cachedStories = !forceRefresh ? browserCache.get<any[]>(cacheKey) : null;
      
      if (cachedStories) {
        console.log('Using cached stories');
        return cachedStories;
      }

      // Fetch from Supabase if not in cache or force refresh requested
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
      
      if (data) {
        // Ensure plot_outline is properly formatted JSON
        if (data.plot_outline) {
          try {
            // Try parsing it to validate
            JSON.parse(data.plot_outline);
          } catch (parseError) {
            console.error('Invalid plot_outline JSON detected, repairing story:', storyId);
            
            // Create a default plot outline
            const defaultOutline = JSON.stringify(["Chapter 1: Begin your story here..."]);
            
            // Update the story in the database with the fixed plot_outline
            await this.updateStory(storyId, { 
              plot_outline: defaultOutline 
            });
            
            // Update the local data object too
            data.plot_outline = defaultOutline;
          }
        } else if (!data.plot_outline || data.plot_outline === '') {
          // If plot_outline is empty, set a default
          console.log('Empty plot_outline detected, adding default outline');
          const defaultOutline = JSON.stringify(["Chapter 1: Begin your story here..."]);
          
          // Update the story with the default outline
          await this.updateStory(storyId, { 
            plot_outline: defaultOutline 
          });
          
          // Update the local data object
          data.plot_outline = defaultOutline;
        }
      }
      
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
        user_id: this.userId,
        is_sequel: story.is_sequel || false,
        parent_story_id: story.parent_story_id || null,
        created_at: new Date().toISOString()
      };

      console.log('Saving story with data:', storyData);

      const { data, error } = await supabase
        .from('stories')
        .insert([storyData])
        .select();

      if (error) throw error;
      
      // Invalidate the user stories cache
      if (this.userId) {
        browserCache.remove(`user_stories_${this.userId}`);
      }
      
      return storyId;
    } catch (error) {
      console.error('Error saving story:', error);
      throw error;
    }
  }

  // Update story in Supabase
  public async updateStory(storyId: string, updates: any): Promise<any> {
    try {
      // Remove any fields that shouldn't be in the stories table
      const { related_series_id, related_stories, is_series, ...validUpdates } = updates;
      
      // Add updated_at timestamp
      validUpdates.updated_at = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('stories')
        .update(validUpdates)
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

  // Generate a sequel idea based on an existing story
  public async generateSequelIdea(originalStory: any, signal?: AbortSignal): Promise<string> {
    try {
      console.log('Starting generateSequelIdea for story:', originalStory?.title);
      
      if (!originalStory) {
        console.error('Original story is null or undefined');
        throw new Error('Original story is missing');
      }
      
      // Get the appropriate client based on user settings
      const client = this.getClient();
      
      // Use the story generation model for sequel ideas
      const model = this.userSettings.use_openai_for_story_gen 
        ? this.userSettings.reasoning_model || 'gpt-4o'
        : this.userSettings.reasoning_model || 'openai/gpt-4o-mini';
      
      console.log(`Using ${this.userSettings.use_openai_for_story_gen ? 'OpenAI' : 'OpenRouter'} with model: ${model} for sequel generation`);

      // Extract the original story details
      const originalTitle = originalStory.title;
      const originalIdea = originalStory.story_idea;
      const originalPlot = typeof originalStory.plot_outline === 'string' 
        ? originalStory.plot_outline 
        : JSON.stringify(originalStory.plot_outline || []);
      
      console.log('Original story details extracted:', {
        title: originalTitle,
        ideaLength: originalIdea?.length || 0,
        plotLength: originalPlot?.length || 0
      });
      
      // Create a prompt for the sequel
      const prompt = `I need a sequel idea for a story titled "${originalTitle}". 
      
The original story idea was: "${originalIdea}"

The original plot outline was: ${originalPlot}

Create a compelling sequel plot that builds upon the original story, continuing where it left off or exploring new directions with the same character(s) or world. The sequel should feel like a natural continuation while introducing new conflicts or challenges.
Be as detailed as possible in your sequel idea to include as much information as possible in the plot.
Write from third person omniscient perspective.
Write the names of all characters and locations whenever they are mentioned.
When you write the narrator's name, write (The Narrator) next to their name.
You must write the sequal idea as a summary style with paragraphs.

Only write the sequel idea and nothing else. DO NOT write any comments or explanations.`;

      console.log('Sending prompt to AI model, length:', prompt.length);
      
      const response = await client.chat.completions.create({
        model: model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7
      }, {
        signal: signal
      });

      console.log('Received response from AI model');
      const sequelIdea = response.choices[0].message.content.trim();
      console.log('Generated sequel idea, length:', sequelIdea.length);
      
      return sequelIdea;
    } catch (error) {
      console.error('Error generating sequel idea:', error);
      throw new Error('Failed to generate sequel idea. Please try again.');
    }
  }

  // Write a scene based on the scene beat, characters, and previous scenes
  public async writeScene(
    sceneBeat: string,
    characters: string,
    previousScenes: string[],
    onProgress?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    console.log('writeScene called with sceneBeat:', sceneBeat ? sceneBeat.substring(0, 50) + '...' : 'undefined or empty');
    console.log('Characters provided:', characters ? 'Yes (length: ' + characters.length + ')' : 'No');
    console.log('Previous scenes count:', previousScenes.length);
    
    if (!sceneBeat || sceneBeat.trim() === '') {
      console.error('Scene beat is empty or undefined');
      throw new Error('Scene beat is required to generate a scene. Please provide a scene beat.');
    }
    
    const recentContext = previousScenes && previousScenes.length
      ? previousScenes.slice(-4)
      : ["No previous context. This is the first scene of the story."];
    const context = recentContext.join('\n\n');

    try {
      // Force reload user settings to ensure we have the latest
      console.log('Force reloading user settings...');
      if (this.userId) {
        // Clear the cache for this user to force a fresh load
        await userSettingsService.clearCache(this.userId);
        this.userSettings = await userSettingsService.getSettings(this.userId);
        console.log('User settings reloaded:', !!this.userSettings);
      } else if (!this.userSettings) {
        console.log('Loading user settings for the first time...');
        await this.loadUserSettings();
        console.log('User settings loaded:', !!this.userSettings);
      }

      console.log('Getting client...');
      const client = this.getClient();
      console.log('Client obtained:', !!client);
      
      // Validate the model
      const isUsingOpenAI = this.userSettings.use_openai_for_story_gen;
      let modelToUse = this.userSettings.story_generation_model;
      
      console.log('Original model:', modelToUse);
      console.log('Using OpenAI:', isUsingOpenAI);
      
      // Format the model correctly for the provider
      modelToUse = this.getFormattedModel(modelToUse, isUsingOpenAI);
      console.log('Formatted model to use:', modelToUse);
      
      const isModelValid = this.validateModel(modelToUse, isUsingOpenAI);
      console.log('Model validation result:', isModelValid);
      
      if (!isModelValid) {
        console.error(`Invalid model format for ${isUsingOpenAI ? 'OpenAI' : 'OpenRouter'}: ${modelToUse}`);
        throw new Error(`Invalid model format: ${modelToUse}. Please check your settings.`);
      }
      
      // Prepare context from previous scenes
      let previousScenesContext = "";
      if (previousScenes && previousScenes.length > 0) {
        previousScenesContext = "Previous scenes:\n\n" + previousScenes.map((scene, index) => 
          `Scene ${index + 1}:\n${scene}`
        ).join("\n\n");
      }

      // Limit context length to avoid token limits
      if (previousScenesContext.length > 8000) {
        previousScenesContext = previousScenesContext.substring(0, 8000) + "...";
      }

      const prompt = `
## WRITING INSTRUCTIONS
- You are an expert fiction writer. Write a full scene WITHOUT overwriting, that is based on the scene beat EXACTLY.
- Address the passage of time mentioned at the beginning of the scene beat by creating a connection to the previous scene's ending.
- Write in past tense.
- Most of what you write should be narration, not dialogue.
- When there is no context, start the scene with exposition to give the reader a better understanding of the plot and characters.
- Do NOT write any appositive phrases.
- Do NOT write any redundant descriptive phrases that are not necessary to the scene.
- Do NOT use asterisks (*) for emphasis or to indicate actions. Use proper narrative descriptions instead.

# Core Requirements
    - Write from first-person narrator perspective only
    - Begin with a clear connection to the previous scene's ending
    - Write the dialogue in their own paragraphs, do not include the dialogue in the same paragraph as the narration.
    - Write everything that the narrator sees, hears, and everything that happens in the scene.
    - Write the entire scene and include everything in the scene beat given, do not leave anything out.
    - Use the character's pronouns if you don't write the character's name. Avoid using they/them pronouns, use the character's pronouns instead.
    
    # Pacing and Suspense
    - Maintain steady, escalating suspense
    - Use strategic pauses and silence for impact
    - Build tension in small, deliberate increments
    - Balance action with reflection

    # Writing Style
    - Use concise language
    - Vary sentence length based on tension:
        * Shorter sentences for action/tension
        * Longer sentences for introspection
    - Show emotions through implications rather than stating them
    
    # Scene Structure
    - Write tight, focused paragraphs
    - Break up dialogue with introspection and description
    - Allow for natural processing of events

## SCENE CONTEXT AND CONTINUITY
# Characters
${characters}

# Use the provided STORY CONTEXT to remember details and events from the previous scenes in order to maintain consistency in the new scene you are writing.
## STORY CONTEXT
<context>
  ${context}
</context>

# Scene Beat to Write
${sceneBeat}
`;

      console.log('Prompt prepared, length:', prompt.length);
      console.log('Using model:', modelToUse);
      console.log('Creating chat completion...');

      try {
        // Prepare the request parameters
        const requestParams = {
          model: modelToUse,
          messages: [
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          stream: true
        };
        
        if (signal) {
          Object.assign(requestParams, { signal });
        }
        
        console.log('Request parameters:', JSON.stringify({
          model: requestParams.model,
          temperature: requestParams.temperature,
          stream: requestParams.stream
        }, null, 2));
        
        // Create the stream
        console.log('Calling client.chat.completions.create...');
        const stream = await client.chat.completions.create(requestParams);
        
        console.log('Stream created successfully');

        let fullContent = '';
        let chunkCount = 0;
        
        // Process the stream
        console.log('Processing stream...');
        for await (const chunk of stream) {
          chunkCount++;
          let content = chunk.choices[0]?.delta?.content || '';
          
          // Remove asterisks from the content
          if (content) {
            content = content.replace(/\*/g, '');
            fullContent += content;
            // Call the progress callback if provided
            if (onProgress) {
              onProgress(content);
            }
          }
          
          // Log progress periodically
          if (chunkCount % 50 === 0) {
            console.log(`Processed ${chunkCount} chunks, current content length: ${fullContent.length}`);
          }
        }
        
        // Final check to remove any asterisks that might have been missed
        fullContent = fullContent.replace(/\*/g, '');
        
        console.log('Stream processing complete, content length:', fullContent.length, 'chunks:', chunkCount);
        return fullContent || 'Failed to generate scene content';
      } catch (streamError: any) {
        console.error('Error creating or processing stream:', streamError);
        
        // Provide more detailed error information
        let errorMessage = 'Failed to generate scene. ';
        
        if (streamError.status) {
          errorMessage += `Status: ${streamError.status}. `;
        }
        
        if (streamError.message) {
          errorMessage += `Message: ${streamError.message}. `;
        }
        
        if (streamError.response) {
          try {
            const responseData = streamError.response.data || {};
            console.error('API response data:', responseData);
            
            if (responseData.error) {
              errorMessage += `API Error: ${responseData.error.message || JSON.stringify(responseData.error)}. `;
            }
          } catch (parseError) {
            console.error('Error parsing API response:', parseError);
          }
        }
        
        errorMessage += 'Please check your API key and model settings.';
        throw new Error(errorMessage);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Scene generation aborted');
        throw err;
      }
      console.error('Error generating scene:', err);
      throw new Error(err.message || 'Failed to generate scene. Please try again.');
    }
  }

  // Revise a scene based on feedback
  public async reviseScene(
    currentContent: string,
    feedback: string,
    sceneBeat: string,
    characters: string,
    onProgress?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    try {
      if (!this.userSettings) {
        await this.loadUserSettings();
      }

      const client = this.getClient();
      
      const userMessage = `## Instructions
Revise the given scene based on the feedback provided.
Maintain the same narrative style, perspective, and tone of the original scene.
Ensure the revised scene still aligns with the scene beat and character descriptions.
Make specific changes requested in the feedback while preserving the overall structure and purpose of the scene.

## Original Scene
${currentContent}

## Feedback
${feedback}

## Scene Beat
${sceneBeat}

## Characters
${characters}

## Output
Write only the revised scene content, formatted as a polished narrative. Do not include any meta-commentary, explanations, or notes about the changes made.`;

      const stream = await client.chat.completions.create({
        model: this.userSettings?.model || 'gpt-4o',
        messages: [
          { role: "system", content: "You are a skilled fiction editor who revises scenes based on feedback." },
          { role: "user", content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        stream: true,
        signal
      });

      let fullContent = '';
      
      // Process the stream
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          // Call the progress callback if provided
          if (onProgress) {
            onProgress(content);
          }
        }
      }
      
      return fullContent || 'Failed to revise scene content';
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Scene revision aborted');
        throw err;
      }
      console.error('Error revising scene:', err);
      throw new Error('Failed to revise scene. Please try again.');
    }
  }

  // Create a sequel from an original story
  public async createSequel(originalStory: any): Promise<string> {
    try {
      // Generate a sequel idea based on the original story
      const sequelIdea = await this.generateSequelIdea(originalStory);
      
      // Create a title for the sequel using the standard title function
      const sequelTitle = await this.createTitle(sequelIdea);
      
      // Create an outline for the sequel
      const outline = await this.createOutline(sequelIdea);
      
      if (!outline) {
        throw new Error('Failed to create outline for sequel');
      }
      
      // Generate characters for the sequel
      const characters = await this.generateCharacters(outline);
      
      if (!characters) {
        throw new Error('Failed to generate characters for sequel');
      }
      
      // Create the sequel story data
      const sequelData = {
        title: sequelTitle,
        story_idea: sequelIdea,
        plot_outline: JSON.stringify(outline),
        characters,
        parent_story_id: originalStory.id,
        is_sequel: true,
        chapters: outline.map((sceneBeat, index) => ({
          title: `Chapter ${index + 1}`,
          content: '',
          completed: false,
          sceneBeat
        }))
      };
      
      // Save the sequel story
      const sequelId = await this.saveStory(sequelData);
      
      // If the original story isn't part of a series yet, create one
      if (!originalStory.is_series && !originalStory.parent_story_id) {
        // Create a series that includes both stories
        const seriesTitle = `The ${originalStory.title} Series`;
        const seriesData = {
          title: seriesTitle,
          story_idea: `A series beginning with "${originalStory.title}" and continuing with "${sequelTitle}".`,
          plot_outline: JSON.stringify([`Part 1: ${originalStory.title}`, `Part 2: ${sequelTitle}`]),
          characters: characters,
          is_series: true,
          related_stories: JSON.stringify([originalStory.id, sequelId])
        };
        
        await this.saveStory(seriesData);
        
        // Update the original story to mark it as part of a series
        await this.updateStory(originalStory.id, {
          is_sequel: false,
          parent_story_id: null
        });
      }
      
      return sequelId;
    } catch (error) {
      console.error('Error creating sequel:', error);
      throw new Error('Failed to create sequel. Please try again.');
    }
  }

  // Delete a story by ID
  public async deleteStory(storyId: string): Promise<void> {
    if (!this.userId) {
      throw new Error('User ID not set');
    }

    try {
      // Check if the story exists and get its data
      const { data: storyData, error: storyError } = await supabase
        .from('stories')
        .select('*')
        .eq('id', storyId)
        .single();

      // If the story doesn't exist, just invalidate the cache and return
      if (storyError && storyError.code === 'PGRST116') {
        console.log(`Story ${storyId} not found in database, cleaning up cache`);
        // Story doesn't exist, just clean up the cache
        browserCache.remove(`user_stories_${this.userId}`);
        browserCache.remove(`story_${storyId}`);
        return;
      } else if (storyError) {
        // Some other error occurred
        throw storyError;
      }

      // We'll handle series relationships in the database using triggers
      // or let the SeriesService handle it

      // Update any sequels to remove the parent reference
      await supabase
        .from('stories')
        .update({ parent_story_id: null })
        .eq('parent_story_id', storyId);

      // Delete the story
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', storyId);

      if (error) throw error;

      // Invalidate the cache
      browserCache.remove(`user_stories_${this.userId}`);
      browserCache.remove(`story_${storyId}`);
      
      // Also invalidate any series caches - we don't know which ones might be affected
      // so we'll just clear all user series
      browserCache.remove(`user_series_${this.userId}`);
    } catch (error) {
      console.error('Error deleting story:', error);
      throw error;
    }
  }

  // Generate a transition between chapters
  public async generateTransition(
    previousChapterContent: string,
    currentChapterContent: string,
    sceneBeat: string,
    onProgress?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    try {
      if (!this.userSettings) {
        await this.loadUserSettings();
      }

      // Extract the last 4 paragraphs from the previous chapter
      const previousParagraphs = previousChapterContent
        .split(/\n\s*\n/)
        .filter(p => p.trim().length > 0)
        .slice(-4);

      // Extract the first 4 paragraphs from the current chapter
      const currentParagraphs = currentChapterContent
        .split(/\n\s*\n/)
        .filter(p => p.trim().length > 0)
        .slice(0, 4);

      // If there's not enough content to work with, return an error
      if (previousParagraphs.length === 0 || currentParagraphs.length === 0) {
        throw new Error('Not enough content in chapters to create a transition');
      }

      const client = this.getClient();
      
      const prompt = `
## TRANSITION WRITING TASK
Create a smooth transition that connects the end of the previous chapter to the beginning of the current chapter.

# Previous Chapter (ending):
${previousParagraphs.join('\n\n')}

# Current Chapter (beginning):
${currentParagraphs.join('\n\n')}

# Scene Beat for Current Chapter:
${sceneBeat}

## Instructions:
- Write at least 2 paragraphs that bridge the gap between these chapters.
- Maintain the same narrative voice and perspective.
- Address any time or location changes explicitly.
- Create a logical flow from the previous chapter's events to the current chapter's setting.
- The transition should feel natural and seamless, not forced.
- Write in the same style as the existing content.
- Write using concise words and casual language, DO NOT write in flowery language.
- Write short sentences and paragraphs to keep it concise.

## Output:
Write only the transition paragraph(s). Do not include any meta-commentary, explanations, or notes.
`;

      const stream = await client.chat.completions.create({
        model: this.userSettings?.model || 'gpt-4o',
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 500,
        stream: true,
        signal
      });

      let fullContent = '';
      
      // Process the stream
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          // Call the progress callback if provided
          if (onProgress) {
            onProgress(content);
          }
        }
      }
      
      // Return just the transition text - it will be added to the beginning of the current chapter
      // by the calling component
      return fullContent.trim();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Transition generation aborted');
        throw err;
      }
      console.error('Error generating transition:', err);
      throw new Error('Failed to generate transition. Please try again.');
    }
  }
}

// Export a singleton instance
export const storyService = StoryService.getInstance(); 