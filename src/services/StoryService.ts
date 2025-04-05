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

// Helper function to generate chapter template
function generateSceneTemplate(numScenes: number): string {
  const template = [];
  for (let i = 1; i <= numScenes; i++) {
    template.push({
      scene_number: i,
      scene_beat: `<Write the ${getOrdinal(i)} chapter beat here>`
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
  private settingsLoaded: boolean = false;

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

    // If settings are already loaded and clients exist, return them
    if (this.settingsLoaded && this.userSettings && (this.openaiClient || this.openrouterClient)) {
      return this.userSettings;
    }

    // Load settings from the service
    this.userSettings = await userSettingsService.getSettings(this.userId);
    
    // Initialize clients only if we have valid API keys and clients don't exist
    if (this.userSettings.openai_key && isValidApiKey(this.userSettings.openai_key) && !this.openaiClient) {
      try {
        this.openaiClient = createOpenAIClient(this.userSettings.openai_key);
      } catch (error) {
        console.error('Failed to initialize OpenAI client:', error);
        this.openaiClient = null;
      }
    }
    
    if (this.userSettings.openrouter_key && isValidApiKey(this.userSettings.openrouter_key) && !this.openrouterClient) {
      try {
        this.openrouterClient = createOpenRouterClient(this.userSettings.openrouter_key);
      } catch (error) {
        console.error('Failed to initialize OpenRouter client:', error);
        this.openrouterClient = null;
      }
    }
    
    this.settingsLoaded = true;
    return this.userSettings;
  }

  private async ensureSettingsLoaded() {
    if (!this.settingsLoaded) {
      await this.loadUserSettings();
    }
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
  private async getClient() {
    await this.ensureSettingsLoaded();
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
      await this.ensureSettingsLoaded();

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
Write unique character names, do NOT use common names from your training data.
All locations should be real locations not fictional locations.
DO NOT write any comments, only write the summary.
Do NOT write names with "Black" in them, use unique names.

Story Content:
${randomPost.selftext}

Please provide a detailed summary in 400-600 words.
`;

      // Get the appropriate client based on user settings
      const client = await this.getClient();
      
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
        ]
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
      await this.ensureSettingsLoaded();

      const allProfiles = settings.load_story_profiles();
      const profile = allProfiles[settings.STORY_PROFILE];
      
      if (!profile) {
        console.log(`Error: Story profile '${settings.STORY_PROFILE}' not found`);
        return 'Failed to generate story idea';
      }

      const prompt = profile.prompts[Math.floor(Math.random() * profile.prompts.length)];
      console.log('Using prompt:', prompt);

      // Get the appropriate client based on user settings
      const client = await this.getOpenAIClient();
      
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
        temperature: 0.7
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
      await this.ensureSettingsLoaded();

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

  // Format scenes from JSON string or JSON-like text
  // Format scenes from JSON string or JSON-like text
  public formatScenes(inputString: string): string[] | null {
    console.log("Raw input to formatScenes:", inputString.substring(0, 200) + "...");
    let textToParse = inputString.trim();

    // Remove markdown code blocks if present
    textToParse = textToParse.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
    console.log("After removing markdown:", textToParse.substring(0, 200) + "...");

    // Find the first likely start of JSON (either { or [)
    const jsonStartIndex = textToParse.search(/[{\[]/);
    if (jsonStartIndex === -1) {
        console.log("No JSON start found. Trying plain text extraction.");
        return this.extractScenesFromPlainText(inputString);
    }
    // Remove any text before the JSON start
    textToParse = textToParse.substring(jsonStartIndex);

    // Find the last likely end of JSON (corresponding } or ])
    // Attempt to find the matching closing bracket for the first opening one
    let openCount = 0;
    let actualEndIndex = -1;
    let firstOpenChar = '';
    for (let i = 0; i < textToParse.length; i++) {
        const char = textToParse[i];
        if (i === 0) firstOpenChar = char; // Record the first opening char

        if (char === '[' || char === '{') {
            openCount++;
        } else if (char === ']' || char === '}') {
            openCount--;
        }
        
        // Check if we closed the initial bracket/brace
        if (openCount === 0 && i > 0 && 
            ((firstOpenChar === '[' && char === ']') || (firstOpenChar === '{' && char === '}'))) {
            actualEndIndex = i;
            break; 
        }
        
        // Handle strings to prevent counting brackets inside them
        if (char === '"') {
            let endQuoteIndex = i + 1;
            while (endQuoteIndex < textToParse.length) {
                if (textToParse[endQuoteIndex] === '"') {
                    // Check for escaped quote
                    if (endQuoteIndex > 0 && textToParse[endQuoteIndex - 1] === '\\') {
                         // It's escaped, continue searching
                    } else {
                        // Found the closing quote
                        i = endQuoteIndex; 
                        break;
                    }
                }
                endQuoteIndex++;
            }
            // If no closing quote found, something is wrong, but proceed with current index
             if(endQuoteIndex === textToParse.length) i = endQuoteIndex;
    console.log("Raw input to formatScenes:", inputString.substring(0, 200) + "...");
    let textToParse = inputString.trim();

    // Remove markdown code blocks if present
    textToParse = textToParse.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
    console.log("After removing markdown:", textToParse.substring(0, 200) + "...");

    // Find the first likely start of JSON (either { or [)
    const jsonStartIndex = textToParse.search(/[{\[]/);
    if (jsonStartIndex === -1) {
        console.log("No JSON start found. Trying plain text extraction.");
        return this.extractScenesFromPlainText(inputString);
    }
    // Remove any text before the JSON start
    textToParse = textToParse.substring(jsonStartIndex);

    // Find the last likely end of JSON (corresponding } or ])
    // Attempt to find the matching closing bracket for the first opening one
    let openCount = 0;
    let actualEndIndex = -1;
    let firstOpenChar = '';
    for (let i = 0; i < textToParse.length; i++) {
        const char = textToParse[i];
        if (i === 0) firstOpenChar = char; // Record the first opening char

        if (char === '[' || char === '{') {
            openCount++;
        } else if (char === ']' || char === '}') {
            openCount--;
        }
        
        // Check if we closed the initial bracket/brace
        if (openCount === 0 && i > 0 && 
            ((firstOpenChar === '[' && char === ']') || (firstOpenChar === '{' && char === '}'))) {
            actualEndIndex = i;
            break; 
        }
        
        // Handle strings to prevent counting brackets inside them
        if (char === '"') {
            let endQuoteIndex = i + 1;
            while (endQuoteIndex < textToParse.length) {
                if (textToParse[endQuoteIndex] === '"') {
                    // Check for escaped quote
                    if (endQuoteIndex > 0 && textToParse[endQuoteIndex - 1] === '\\') {
                         // It's escaped, continue searching
                    } else {
                        // Found the closing quote
                        i = endQuoteIndex; 
                        break;
                    }
                }
                endQuoteIndex++;
            }
            // If no closing quote found, something is wrong, but proceed with current index
             if(endQuoteIndex === textToParse.length) i = endQuoteIndex;
        }
    }

    if (actualEndIndex !== -1) {
        textToParse = textToParse.substring(0, actualEndIndex + 1);
        console.log("After bracket/brace matching:", textToParse.substring(0, 200) + "...");
    } else {
        console.warn("Could not reliably find matching end bracket/brace. Proceeding with potentially incomplete JSON.");
        // As a fallback, try finding the last bracket/brace
        const lastBracketIndex = Math.max(textToParse.lastIndexOf(']'), textToParse.lastIndexOf('}'));
        if (lastBracketIndex > 0) { // Only trim if a closing bracket is found after the start
             textToParse = textToParse.substring(0, lastBracketIndex + 1);
        }
    }

    // Sanitize the potentially extracted JSON string
    const sanitizedString = this.sanitizeJsonString(textToParse);
    console.log("String going into JSON.parse:", sanitizedString.substring(0, 200) + "...");

    let parsedData;
    try {
      parsedData = JSON.parse(sanitizedString);
    } catch (parseError: any) {
      const errorPos = parseError.message.match(/position (\d+)/)?.[1];
      const contextSnippet = errorPos ? sanitizedString.substring(Math.max(0, parseInt(errorPos) - 30), Math.min(sanitizedString.length, parseInt(errorPos) + 30)) : '(no position info)';
      console.error(`JSON parse error: ${parseError.message}. Context around position ${errorPos || 'N/A'}: "...${contextSnippet}..."`);
      console.log("Attempting manual scene extraction as fallback... Using ORIGINAL input string.");
      return this.extractScenesManually(inputString); // Use original input for manual extraction
    }

    // Determine if the parsed data is an array or a single object
    const scenesArray = Array.isArray(parsedData) ? parsedData : [parsedData];

    const formattedScenes: string[] = [];
    for (const scene of scenesArray) {
      if (typeof scene === 'object' && scene !== null) {
        const beat = scene.scene_beat || scene.chapter_beat;
        const number = scene.scene_number ?? scene.chapter_number;

        if (number != null && typeof beat === 'string' && beat.trim().length > 0) {
          formattedScenes.push(beat.trim());
    } else {
          console.warn("Skipping scene object due to missing/invalid number or beat:", JSON.stringify(scene));
        }
          } else {
        console.warn("Skipping non-object item in scenes array:", JSON.stringify(scene));
      }
    }

    if (formattedScenes.length === 0) {
      console.warn("Warning: No valid scenes extracted from the parsed JSON data. Trying manual extraction using ORIGINAL input string.");
      return this.extractScenesManually(inputString); // Fallback if parsing succeeded but found no valid scenes
    }

    console.log(`Successfully parsed ${formattedScenes.length} scenes from JSON.`);
    return formattedScenes;
  }

  // New method to convert plain text to JSON format (Revised)
  private convertPlainTextToJson(text: string): string {
    console.log("Attempting to convert plain text to JSON format");
    const scenes = this.extractScenesFromPlainText(text); // Reuse extraction logic
    
    // Convert extracted scenes to the desired JSON format
    const jsonScenes = scenes.map((sceneText, index) => ({
      scene_number: index + 1, // Or use chapter_number if preferred
      scene_beat: sceneText // Or use chapter_beat if preferred
    }));
    
    console.log(`Converted ${jsonScenes.length} scenes to JSON format`);
    // Return the stringified JSON array
    return JSON.stringify(jsonScenes, null, 2); // Pretty print for potential debugging
    // Return the stringified JSON array
    return JSON.stringify(jsonScenes, null, 2); // Pretty print for potential debugging
  }
  
  // New helper method to extract scenes from plain text narrative (Revised)
  private extractScenesFromPlainText(text: string): string[] {
    console.log("Extracting scenes from plain text narrative...");
      const scenes: string[] = [];
    
    // 1. Try splitting by chapter/scene markers first
    const chapterMarkers = text.match(/^s*(Chapter|Scene)s+d+[:.]?/gmi);
    if (chapterMarkers && chapterMarkers.length > 1) {
      const parts = text.split(/^s*(Chapter|Scene)s+d+[:.]?/mi);
      for (let i = 1; i < parts.length; i++) { // Start from 1 to skip content before the first marker
        const sceneContent = parts[i].trim();
        if (sceneContent) scenes.push(sceneContent);
      }
      if (scenes.length > 0) {
          console.log(`Extracted ${scenes.length} scenes based on 'Chapter/Scene' markers.`);
      return scenes;
      }
    }

    // 2. Try splitting by double newlines (paragraphs)
    const paragraphs = text.split(/ns*n/).map(p => p.trim()).filter(p => p.length > 0);
    if (paragraphs.length > 1) {
        // Group paragraphs into scenes if reasonable (e.g., aiming for 5-10 scenes)
        const targetSceneCount = Math.min(10, Math.max(5, Math.round(paragraphs.length / 3)));
        const paragraphsPerScene = Math.max(1, Math.ceil(paragraphs.length / targetSceneCount));
        
        for (let i = 0; i < paragraphs.length; i += paragraphsPerScene) {
          const sceneChunk = paragraphs.slice(i, i + paragraphsPerScene).join('n');
          scenes.push(sceneChunk);
        }
        if (scenes.length > 0) {
            console.log(`Extracted ${scenes.length} scenes by grouping ${paragraphsPerScene} paragraphs.`);
            return scenes;
        }
    }
    
    // 3. Fallback: Split by sentences if very little structure
    if (scenes.length === 0 && text.length > 0) {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]; // Basic sentence split
        const sentencesPerScene = Math.max(3, Math.ceil(sentences.length / 8)); // Aim for ~8 scenes
        for (let i = 0; i < sentences.length; i += sentencesPerScene) {
            const sceneChunk = sentences.slice(i, i + sentencesPerScene).join(' ').trim();
            if (sceneChunk) scenes.push(sceneChunk);
        }
      if (scenes.length > 0) {
            console.log(`Extracted ${scenes.length} scenes by grouping sentences.`);
        return scenes;
      }
    }
    
    // 4. Absolute Fallback: Return the whole text as one scene
    if (scenes.length === 0 && text.trim().length > 0) {
        console.log("Could not split text, returning as single scene.");
        return [text.trim()];
    }
    
    console.log("No scenes extracted from plain text.");
    return [];
    console.log("No scenes extracted from plain text.");
    return [];
  }

  // Helper method to sanitize JSON string (Revised - minimal changes)

  // Helper method to sanitize JSON string (Revised - minimal changes)
  private sanitizeJsonString(jsonString: string): string {
      // console.log("Sanitizing JSON string...");
      // Remove specific problematic Unicode control characters U+0000 to U+001F, except for valid whitespace like \t, \n, \r
      let result = jsonString.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
      // console.log("Sanitization complete.");
    return result;
  }
  
  // Fallback method to extract scenes when JSON parsing fails (Revised)
  private extractScenesManually(text: string): string[] | null {
    console.log("Attempting manual scene extraction from original text...");
      const scenes: string[] = [];

    // Regex to find scene_beat or chapter_beat values, more tolerant of formatting
    const beatRegex = /["'](?:scene_beat|chapter_beat)["']\s*:\s*["']((?:.|\n)*?)["']/gi;
    let match;
    while ((match = beatRegex.exec(text)) !== null) {
        // Ensure match[1] exists and is a string before trying to replace/trim
        if (match && typeof match[1] === 'string') {
            const beatContent = match[1]
                .replace(/\\"/g, '"')     // Replace escaped quotes
                .replace(/\\n/g, '\n')     // Replace escaped newlines
                .replace(/\\t/g, '\t')     // Replace escaped tabs
                .replace(/\\\//g, '/')    // Replace escaped slashes
                .replace(/\\\\/g, '\\')    // Replace escaped backslashes
                .trim();
            if (beatContent) {
                scenes.push(beatContent);
            }
        } else {
             console.warn("Manual extraction regex match found, but capture group 1 was invalid:", match);
        } else {
             console.warn("Manual extraction regex match found, but capture group 1 was invalid:", match);
        }
      }
      
      if (scenes.length > 0) {
      console.log(`Manually extracted ${scenes.length} scenes using regex.`);
        return scenes;
      }
      
    // If regex fails, fall back to plain text extraction on the original string
    console.log("Manual regex extraction failed, trying plain text extraction as last resort...");
    return this.extractScenesFromPlainText(text);
  }

  // Create outline from story idea using structured output for OpenRouter
  // Create outline from story idea using structured output for OpenRouter
  public async createOutline(idea: string, signal?: AbortSignal): Promise<string[] | null> {
    try {
      await this.ensureSettingsLoaded();

      // Get user-defined chapter range or use defaults
      const minChapters = this.userSettings?.min_chapters || 5;
      const maxChapters = this.userSettings?.max_chapters || 7;
      // Ensure min is not greater than max
      const effectiveMinChapters = Math.min(minChapters, maxChapters);
      const effectiveMaxChapters = Math.max(minChapters, maxChapters);
      console.log(`Target chapter range: ${effectiveMinChapters}-${effectiveMaxChapters}`);

      // Get user-defined chapter range or use defaults
      const minChapters = this.userSettings?.min_chapters || 5;
      const maxChapters = this.userSettings?.max_chapters || 7;
      // Ensure min is not greater than max
      const effectiveMinChapters = Math.min(minChapters, maxChapters);
      const effectiveMaxChapters = Math.max(minChapters, maxChapters);
      console.log(`Target chapter range: ${effectiveMinChapters}-${effectiveMaxChapters}`);

      const allProfiles = settings.load_story_profiles();
      const profile = allProfiles[settings.STORY_PROFILE];
      
      if (!profile) {
        console.log(`Error: Story profile '${settings.STORY_PROFILE}' not found`);
        return null;
      }

      let retries = 0;

      // Define the JSON Schema using the effective chapter range
      const outlineSchema = {
        type: "array",
        items: {
          type: "object",
          properties: {
            chapter_number: {
              type: "integer",
              description: "The sequential number of the chapter."
            },
            chapter_beat: {
              type: "string",
              description: `A detailed summary of the events in this chapter (approx 250 words).`
            }
          },
          required: ["chapter_number", "chapter_beat"],
          additionalProperties: false
        },
        minItems: effectiveMinChapters,
        maxItems: effectiveMaxChapters
      };

      // Define the JSON Schema using the effective chapter range
      const outlineSchema = {
        type: "array",
        items: {
          type: "object",
          properties: {
            chapter_number: {
              type: "integer",
              description: "The sequential number of the chapter."
            },
            chapter_beat: {
              type: "string",
              description: `A detailed summary of the events in this chapter (approx 250 words).`
            }
          },
          required: ["chapter_number", "chapter_beat"],
          additionalProperties: false
        },
        minItems: effectiveMinChapters,
        maxItems: effectiveMaxChapters
      };
      
      while (retries < 5) {
        try {
          // Update prompt to use the dynamic chapter range
          // Update prompt to use the dynamic chapter range
          const userMessage = `## OUTLINE REQUIREMENTS
- The plot outline must contain between ${effectiveMinChapters} and ${effectiveMaxChapters} chapters. These are STRICT requirements.
- The plot outline must contain between ${effectiveMinChapters} and ${effectiveMaxChapters} chapters. These are STRICT requirements.
- If there are plot holes in the story idea, you MUST fix them in the plot outline.
- DO NOT write an epilogue as the final chapter. The final chapter must be the resolution or provide an opening for a potential sequel.
- DO NOT write an epilogue as the final chapter. The final chapter must be the resolution or provide an opening for a potential sequel.

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

## You must STRICLY use following JSON format for the plot outline exactly without deviation, DO NOT write in markdown format:
[
  {
    "chapter_number": 1,
    "chapter_beat": "chapter 1 content..."
    "chapter_number": 1,
    "chapter_beat": "chapter 1 content..."
  },
  {
    "chapter_number": 2,
    "chapter_beat": "chapter 2 content..."
  }
    "chapter_number": 2,
    "chapter_beat": "chapter 2 content..."
  }
]

## Story Idea:
${idea}`;

          const client = await this.getClient();
          const useOpenAI = this.userSettings.use_openai_for_story_gen;
          const model = useOpenAI 
          const useOpenAI = this.userSettings.use_openai_for_story_gen;
          const model = useOpenAI 
            ? this.userSettings.reasoning_model || 'gpt-4o'
            : this.userSettings.reasoning_model || 'anthropic/claude-3.7-sonnet:thinking';
          
          console.log(`Using ${useOpenAI ? 'OpenAI' : 'OpenRouter'} with model: ${model} for outline creation`);
          
          const requestParams: any = {
            model: model,
              temperature: 0.8,
            messages: [{ role: "user", content: userMessage }],
          };
          
          // Add structured output only if NOT using OpenAI (and assuming model compatibility)
          if (!useOpenAI) { 
              console.log("Attempting to use OpenRouter structured output (json_schema)");
              requestParams.response_format = {
                  type: "json_schema",
                  json_schema: {
                      name: "story_outline",
                      strict: true, 
                      description: `A plot outline with ${effectiveMinChapters}-${effectiveMaxChapters} chapters detailing story events.`, // Dynamic description
                      schema: outlineSchema
                  }
              };
          } else {
              console.log("Using standard output for OpenAI, relying on prompt for JSON format.");
          }
          
          const response = await client.chat.completions.create(requestParams, { signal });
          const responseContent = response.choices[0].message.content || '';

          console.log("Raw response content:", responseContent.substring(0, 200) + "...");

          let parsedOutline: any[];
          try {
              parsedOutline = JSON.parse(responseContent);
              if (!Array.isArray(parsedOutline)) {
                  throw new Error("Parsed response is not an array.");
              }
          } catch (parseError: any) {
              console.error(`Attempt ${retries + 1}: Failed to parse response as JSON: ${parseError.message}`);
              console.log("Falling back to formatScenes parser...");
              const fallbackOutline = this.formatScenes(responseContent);
              if (fallbackOutline && fallbackOutline.length >= effectiveMinChapters && fallbackOutline.length <= effectiveMaxChapters) {
                 console.log(`Outline successfully parsed via fallback formatScenes with ${fallbackOutline.length} scenes.`);
                 return fallbackOutline;
              } else {
                 console.warn(`Attempt ${retries + 1}: JSON parsing/fallback failed or chapter count (${fallbackOutline?.length}) outside range ${effectiveMinChapters}-${effectiveMaxChapters}. Retrying...`);
                 retries += 1;
                 if(retries >= 5) throw new Error("Failed to generate or parse a valid outline after multiple retries.");
                 await new Promise(resolve => setTimeout(resolve, 1000));
                 continue;
              }
          }

          // Validate structure and extract beats from the successfully parsed JSON
          const outlineBeats = parsedOutline.map((item: any) => {
              if (typeof item === 'object' && item !== null && 
                  (item.chapter_number != null || item.scene_number != null) && 
                  typeof (item.chapter_beat || item.scene_beat) === 'string') {
                  return (item.chapter_beat || item.scene_beat).trim();
              }
              console.warn("Invalid item found in parsed outline array:", item);
              return null;
          }).filter((beat): beat is string => beat !== null && beat.length > 0);
          
          // Validate against dynamic chapter range
          if (outlineBeats.length < effectiveMinChapters || outlineBeats.length > effectiveMaxChapters) {
               console.warn(`Attempt ${retries + 1}: Outline length (${outlineBeats.length}) outside required ${effectiveMinChapters}-${effectiveMaxChapters} range. Retrying...`);
            retries += 1;
               if(retries >= 5) throw new Error(`Failed to generate an outline with the required number of chapters (${effectiveMinChapters}-${effectiveMaxChapters}) after ${retries} attempts. Last count: ${outlineBeats.length}`);
               await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }

          console.log(`Outline successfully created and parsed with ${outlineBeats.length} chapters.`);
          return outlineBeats; // Success

          console.log(`Outline successfully created and parsed with ${outlineBeats.length} chapters.`);
          return outlineBeats; // Success

        } catch (err: any) {
            if (err.name === 'AbortError') throw err; 
            console.error(`Error in createOutline (Attempt ${retries + 1}):`, err.message);
          retries += 1;
            if(retries >= 5) throw new Error(`Failed to create outline after ${retries} attempts due to errors: ${err.message}`);
            await new Promise(resolve => setTimeout(resolve, 1500)); 
        }
    } // End while loop
    
    console.error(`Failed to create outline after ${retries} attempts.`); // Updated log
      return null;
    
  } catch (err: any) { 
      console.error("Critical error during outline creation setup:", err.message);
      return null;
  }
}

  // Generate characters for the story
  public async generateCharacters(outline: string[], signal?: AbortSignal): Promise<string | null> {
    let retries = 0;
    while (retries < 10) {
      try {
        await this.ensureSettingsLoaded();

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
        const client = await this.getClient();
        
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
      await this.ensureSettingsLoaded();

      const client = await this.getOpenRouterClient();
      const model = this.userSettings.story_generation_model;

      console.log('Starting chapter rewrite with model:', model);

      const stream = await client.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: `##INSTRUCTIONS  
You will be given a section of text and you MUST perform the following to it:

---

## WHAT TO REMOVE  
- Eliminate all appositive phrases relating to people or objects, except those that contain foreshadowing.  
- Eliminate all absolute phrases relating to people or objects, except those that provide sensory information or describe physical sensations.  
- Eliminate all metaphors in the text.  
- Eliminate all sentences that add unnecessary detail or reflection without contributing new information to the chapter.  
- Eliminate all sentences that hinder the pacing of the chapter by adding excessive descriptions of the environment, atmosphere, or setting unless they directly affect character actions or emotions.  
- Eliminate all phrases that mention the character's heart pounding or heart in their throat.  
- Eliminate all sentences and phrases that mention light casting long shadows.  

If a paragraph doesn't need to be changed, leave it as is in the returned text.

---

## WHAT TO REWRITE  
- Re-write any sentences or phrases that have "I frowned" in them or similar wording.  
- Re-write any sentences mentioning the air being stale and/or heavy.  
- Re-write ALL flowery language to use casual and simple vocabulary.  
- Re-write sentences that use the word **"despite"** to show contrast between two things, especially when describing sensory experiences or conditions. Example: "sweat soaking through my uniform despite the mild June temperature" should be reworded for clarity and natural tone (e.g., "Even though it was mild for June, sweat was already soaking through my uniform").  
- Re-write lists or grouped descriptions in narration to include **", and"** before the final item (e.g., "composed, focused, and almost expectant").  
- Re-write any sentence that omits conjunctions or transition words where their inclusion would improve clarity or sentence flow.

---

## WORDS TO REPLACE  
Re-write sentences with the following words using synonyms that are casual and simple.

**Words:**  
- Loomed  
- Sinewy  
- Foreboding  
- Grotesque  
- Familiar  
- Shift/Shifting/Shifted  
- Gaze  
- Punctuated  
- Form  
- Monotonous  
- Frowned  
- Hum/Humming/Hummed  
- Rough-hewn  
- Camaraderie  
- Echoed  

Only respond with the modified text and nothing else. You MUST respond with the FULL text.`
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
    await this.ensureSettingsLoaded();

    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get the appropriate client based on user settings
        const client = await this.getOpenAIClient();
        
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
      const client = await this.getClient();
      
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

  // Write a chapter based on the chapter beat, characters, and previous scenes
  public async writeScene(
    sceneBeat: string,
    characters: string,
    previousScenes: string[],
    onProgress?: (chunk: string) => void,
    signal?: AbortSignal,
    futureScenes?: string[]
  ): Promise<string> {
    console.log('writeScene called with sceneBeat:', sceneBeat ? sceneBeat.substring(0, 50) + '...' : 'undefined or empty');
    console.log('Characters provided:', characters ? 'Yes (length: ' + characters.length + ')' : 'No');
    console.log('Previous scenes count:', previousScenes.length);
    console.log('Future scenes provided:', futureScenes ? 'Yes (count: ' + futureScenes.length + ')' : 'No');
    
    if (!sceneBeat || sceneBeat.trim() === '') {
      console.error('chapter beat is empty or undefined');
      throw new Error('chapter beat is required to generate a chapter. Please provide a chapter beat.');
    }
    
    const recentContext = previousScenes && previousScenes.length
      ? previousScenes.slice(-4)
      : ["No previous context. This is the first chapter of the story."];
    const context = recentContext.join('\n\n');

    // Format future scenes if provided
    const formattedFutureScenes = futureScenes && futureScenes.length 
      ? futureScenes.map((chapter, index) => `Future chapter ${index + 1}:\n${chapter}`).join('\n\n')
      : "No future scenes provided.";

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
      const client = await this.getClient();
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
        previousScenesContext = "Previous scenes:\n\n" + previousScenes.map((chapter, index) => 
          `chapter ${index + 1}:\n${chapter}`
        ).join("\n\n");
      }

      // Limit context length to avoid token limits
      if (previousScenesContext.length > 8000) {
        previousScenesContext = previousScenesContext.substring(0, 8000) + "...";
      }

      const prompt = `
## WRITING INSTRUCTIONS
- You are an expert fiction writer. Write a full chapter WITHOUT overwriting, that is based on the chapter beat EXACTLY.
- Address the passage of time mentioned at the beginning of the chapter beat by creating a connection to the previous chapter's ending.
- Write in past tense.
- Write narration as much as possible to give the reader more information about the chapter.
- When there is no context, start the chapter with exposition to give the reader a better understanding of the plot and characters.

##Chapter Transition Guidelines
- Begin each chapter with a natural continuation from the previous scene’s final moment.
- Use a short paragraph that flows directly from the emotional tone or unresolved tension of the last chapter.
- Do NOT summarize what just happened. Instead, hint at or build on it with the narrator’s present thoughts, surroundings, or mood.
- Avoid starting a chapter with phrases like “Two days had passed since…” or any form of recap.
##Chapter Transition Guidelines
- Begin each chapter with a natural continuation from the previous scene’s final moment.
- Use a short paragraph that flows directly from the emotional tone or unresolved tension of the last chapter.
- Do NOT summarize what just happened. Instead, hint at or build on it with the narrator’s present thoughts, surroundings, or mood.
- Avoid starting a chapter with phrases like “Two days had passed since…” or any form of recap.


# Core Requirements
    - Write from first-person narrator perspective only
    - Begin with a clear connection to the previous chapter's ending
    - Write the dialogue in their own paragraphs, do not include the dialogue in the same paragraph as the narration.
    - Write everything that the narrator sees, hears, and everything that happens in the chapter.
    - Write the entire chapter and include everything in the chapter beat given, do not leave anything out.
    - Use the character's pronouns if you don't write the character's name. Avoid using they/them pronouns, use the character's pronouns instead.
    
    # Pacing and Suspense
    - Maintain steady, escalating suspense
    - Use strategic pauses and silence for impact
    - Build tension in small, deliberate increments
    - Balance action with reflection

    # Writing Style
    - DO NOT write flowery language, use casual and simple vocabulary.
    - Do NOT write any appositive phrases.
    - Do NOT write any redundant descriptive phrases that are not necessary to the chapter.
    - Do NOT use asterisks (*) for emphasis or to indicate actions. Use proper narrative descriptions instead.
    - ONLY provide descriptions about the chapter if it furthers the plot or character development, DO NOT write redundant descriptions that provide no useful information about the chapter.
    - Vary sentence length based on tension:
        * Shorter sentences for action/tension
        * Longer sentences for introspection
    - Show emotions through implications rather than stating them
    
    # chapter Structure
    - Write tight, focused paragraphs
    - Break up dialogue with introspection and description
    - Allow for natural processing of events

## chapter CONTEXT AND CONTINUITY
# Characters
${characters}

# Use the provided STORY CONTEXT to remember details and events from the previous scenes in order to maintain consistency in the new chapter you are writing.
## STORY CONTEXT
<context>
  ${context}
</context>

# Future chapter Beats
<future_scenes>
  ${formattedFutureScenes}
</future_scenes>

## Future Context Guidelines
- DO NOT directly reference future events in your current chapter
- DO plant subtle foundations or foreshadowing that will support future scenes
- AVOID creating details that would contradict or make future scenes impossible
- ENSURE character decisions and development align with their future trajectory
- BE AWARE of future plot points, but maintain suspense and discovery in the current chapter

# chapter Beat to Write
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
          temperature: 0.5,
          temperature: 0.5,
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
        return fullContent || 'Failed to generate chapter content';
      } catch (streamError: any) {
        console.error('Error creating or processing stream:', streamError);
        
        // Provide more detailed error information
        let errorMessage = 'Failed to generate chapter. ';
        
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
        console.log('chapter generation aborted');
        throw err;
      }
      console.error('Error generating chapter:', err);
      throw new Error(err.message || 'Failed to generate chapter. Please try again.');
    }
  }

  // Revise a chapter based on feedback
  public async reviseScene(
    currentContent: string,
    feedback: string,
    sceneBeat: string,
    characters: string,
    onProgress?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    try {
      await this.ensureSettingsLoaded();

      const client = await this.getOpenRouterClient();
      
      const userMessage = `## Instructions
Revise the given chapter based on the feedback provided.
Maintain the same narrative style, perspective, and tone of the original chapter.
Ensure the revised chapter still aligns with the chapter beat and character descriptions.
Make specific changes requested in the feedback while preserving the overall structure and purpose of the chapter.

## Original chapter
${currentContent}

## Feedback
${feedback}

## chapter Beat
${sceneBeat}

## Characters
${characters}

## Output
Write only the revised chapter content, formatted as a polished narrative. Do not include any meta-commentary, explanations, or notes about the changes made.`;

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
      
      return fullContent || 'Failed to revise chapter content';
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('chapter revision aborted');
        throw err;
      }
      console.error('Error revising chapter:', err);
      throw new Error('Failed to revise chapter. Please try again.');
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
      await this.ensureSettingsLoaded();

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

      const client = await this.getOpenRouterClient();
      
      const prompt = `
## TRANSITION WRITING TASK
Create a smooth transition that connects the end of the previous chapter to the beginning of the current chapter.

# Previous Chapter (ending):
${previousParagraphs.join('\n\n')}

# Current Chapter (beginning):
${currentParagraphs.join('\n\n')}

# chapter Beat for Current Chapter:
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
- Write tight, focused paragraphs

## Output:
Write only the transition paragraph(s). Do not include any meta-commentary, explanations, or notes.
`;

      const stream = await client.chat.completions.create({
        model: this.userSettings.reasoning_model,
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
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

  // Generate a summary of a story idea
  public async generateStoryIdeaSummary(storyIdea: string, signal?: AbortSignal): Promise<string> {
    try {
      await this.ensureSettingsLoaded();
      
      // Get the appropriate client based on user settings
      const client = await this.getOpenRouterClient();
      
      // Use the reasoning model for summarization
      const model = 'anthropic/claude-3.7-sonnet';
      
      console.log(`Using OpenRouter with model: ${model} for story idea summarization`);
      
      const summaryPrompt = `
Create a concise summary of the following story idea. The summary should:
- Be approximately 100-150 words
- Capture the core concept and main plot points
- Highlight the most interesting elements
- Be written in an engaging style that makes the reader want to know more
- Write in a casual style, DO NOT write in flowery language.

Story Idea:
${storyIdea}

Please provide only the summary without any additional comments or explanations, DO NOT write a title or anything else, only the summary.
`;
      
      const summaryResponse = await client.chat.completions.create({
        model: model,
        messages: [
          { 
            role: "user", 
            content: summaryPrompt 
          }
        ],
        temperature: 0.7
      }, {
        signal: signal
      });

      if (summaryResponse.choices && summaryResponse.choices.length > 0 && summaryResponse.choices[0].message && summaryResponse.choices[0].message.content) {
        return summaryResponse.choices[0].message.content.trim() || 'Summary not available';
      } else {
        console.error('Invalid response structure:', summaryResponse);
        throw new Error('Invalid response structure');
      }
    } catch (error) {
      console.error('Error generating story idea summary:', error);
      return 'Unable to generate summary at this time.';
    }
  }
}

// Export a singleton instance
export const storyService = StoryService.getInstance(); 