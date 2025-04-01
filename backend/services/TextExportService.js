const { OpenAI } = require('openai');
const { EventEmitter } = require('events');
const { createClient } = require('@supabase/supabase-js');

class TextExportService {
  constructor() {
    this.progressEmitter = new EventEmitter();
    this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  async getUserSettings(userId) {
    const { data, error } = await this.supabase
      .from('user_settings')
      .select('openrouter_key, story_generation_model')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error("Supabase fetch error details:", error); 
      throw new Error('Failed to fetch user settings');
    }
    if (!data) throw new Error('User settings not found');
    if (!data.openrouter_key) throw new Error('OpenRouter API key not configured');
    if (!data.story_generation_model) throw new Error('Story generation model not configured');

    return data;
  }

  async rewriteInChunks(text, userId, sessionId) {
    try {
      // Get user settings for API key and model
      const settings = await this.getUserSettings(userId);
      
      // Initialize OpenAI client with user's API key
      const openai = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: settings.openrouter_key,
      });

      console.log('Starting chapter rewrite with model:', settings.story_generation_model);

      const stream = await openai.chat.completions.create({
        model: 'anthropic/claude-3.7-sonnet',
        messages: [
          {
            role: "system",
            content: `##INSTRUCTIONS
You will be given a section of text and you MUST perform the following to it:

---

## WHAT TO REMOVE
-Eliminate all appositive phrases relating to people or objects, except those that contain foreshadowing.
-Eliminate all absolute phrases relating to people or objects, except those that provide sensory information or describe physical sensations.
-Eliminate all metaphors in the text.
-Eliminate all sentences that add unnecessary detail or reflection without contributing new information to the chapter.
-Eliminate all sentences that hinder the pacing of the chapter by adding excessive descriptions of the environment, atmosphere, or setting unless they directly affect character actions or emotions.
-Eliminate all phrases that mention the character's heart pounding or heart in their throat.
If a paragraph doesn't need to be changed, leave it as is in the returned text.
-Eliminate all sentences and phrases that mention light casting long shadows.

---

##WHAT TO REWRITE
- Re-write any sentences or phrases that have "I frowned" in them or similar wording.
- Re-write any sentences mentioning the air being stale and/or heavy.
- Re-write ALL flowery language to use casual and simple vocabulary
- Re-write any sentences that mention the character's heart pounding or heart in their throat.
- Re-write any sentences that mention the weight of something in their pocket.

---

##WORDS TO REPLACE
#Re-write sentences with the following words with synonyms that are casual and simple.

#Words:
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
- rough-hewn
- camaraderie
- echoed
- observed

Only respond with the modified text and nothing else. You MUST respond with the FULL text.`
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 1,
        stream: true
      });

      let fullContent = '';
      let progress = 0;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          progress = Math.min((fullContent.length / text.length) * 100, 100);
          
          // Emit progress event
          this.progressEmitter.emit(`progress:${sessionId}`, {
            progress,
            content,
            userId
          });
        }
      }

      return fullContent || text;
    } catch (err) {
      console.error('Error rewriting chapter:', err);
      return text;
    }
  }

  async exportAsText(chapters, title, userId) {
    try {
      const sessionId = `export_${Date.now()}_${userId}`;
      const totalChapters = chapters.length;
      let completedChapters = 0;
      
      // Process each chapter
      const processedChapters = await Promise.all(
        chapters.map(async (chapter, index) => {
          try {
            // Emit start of chapter processing
            this.progressEmitter.emit(`progress:${sessionId}`, {
              progress: (completedChapters / totalChapters) * 100,
              currentChapter: chapter.title,
              userId
            });

            const rewrittenContent = await this.rewriteInChunks(
              chapter.content,
              userId,
              sessionId
            );

            completedChapters++;
            return rewrittenContent;
          } catch (error) {
            console.error(`Error processing chapter ${chapter.title}:`, error);
            return chapter.content;
          }
        })
      );

      // Join chapters with spacing
      const storyContent = processedChapters.join('\n\n\n\n');
      
      // Emit completion
      this.progressEmitter.emit(`progress:${sessionId}`, {
        progress: 100,
        currentChapter: 'Complete',
        userId
      });

      return { content: storyContent, sessionId };
    } catch (error) {
      console.error("Text export process ended:", error);
      throw error;
    }
  }

  // Method to subscribe to progress updates
  subscribeToProgress(sessionId, callback) {
    this.progressEmitter.on(`progress:${sessionId}`, callback);
  }

  // Method to unsubscribe from progress updates
  unsubscribeFromProgress(sessionId, callback) {
    this.progressEmitter.removeListener(`progress:${sessionId}`, callback);
  }
}

module.exports = new TextExportService(); 