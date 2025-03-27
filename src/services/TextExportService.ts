import { supabase } from "@/integrations/supabase/client";
import { userSettingsService } from "@/services/UserSettingsService";
import { storyService } from "@/services/StoryService";

interface ExportProgress {
  progress: number;
  currentChapter: string;
}

interface Chapter {
  title: string;
  content: string;
  completed: boolean;
  sceneBeat: string;
}

export class TextExportService {
  private static instance: TextExportService;

  private constructor() {}

  public static getInstance(): TextExportService {
    if (!TextExportService.instance) {
      TextExportService.instance = new TextExportService();
    }
    return TextExportService.instance;
  }

  public async exportAsText(
    chapters: Chapter[], 
    title: string, 
    onProgress?: (progress: ExportProgress) => void,
    signal?: AbortSignal
  ): Promise<string> {
    try {
      // Set initial progress
      if (onProgress) {
        onProgress({
          progress: 0,
          currentChapter: "Processing multiple chapters..."
        });
      }

      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Clear cache and get fresh settings
      userSettingsService.clearCache(session.user.id);
      const settings = await userSettingsService.getSettings(session.user.id);
      if (!settings.story_generation_model) {
        throw new Error('Story generation model not configured. Please configure it in settings.');
      }

      // Track overall progress across all chapters
      const totalChapters = chapters.length;
      let completedChapters = 0;
      const chapterProgresses = new Array(totalChapters).fill(0);
      const progressPerChapter = 100 / totalChapters;
      
      // Create a ref to store the current chapter being processed
      let currentChapterTitle = "Processing multiple chapters...";
      
      // Update progress
      if (onProgress) {
        onProgress({
          progress: 0,
          currentChapter: currentChapterTitle
        });
      }

      // Function to update the progress based on all chapter progresses
      const updateOverallProgress = () => {
        const overallProgress = chapterProgresses.reduce((sum, progress) => sum + progress, 0);
        if (onProgress) {
          onProgress({
            progress: overallProgress,
            currentChapter: currentChapterTitle
          });
        }
      };

      // Create promises for each chapter
      const chapterPromises = chapters.map((chapter, index) => {
        return new Promise<string>(async (resolve) => {
          // Check if export was cancelled at the start
          if (signal?.aborted) {
            resolve(chapter.content); // Return original content if cancelled
            return;
          }

          try {
            // Track streaming progress for current chapter
            let chapterStreamProgress = 0;
            const streamCallback = (chunk: string) => {
              // Update progress for this specific chapter
              chapterStreamProgress += chunk.length / chapter.content.length;
              chapterProgresses[index] = Math.min(chapterStreamProgress * progressPerChapter, progressPerChapter);
              
              // Update current chapter title when this chapter gets focus
              currentChapterTitle = `Processing ${chapter.title} and others...`;
              
              // Update overall progress
              updateOverallProgress();
            };

            // Use StoryService's rewriteInChunks
            const rewrittenContent = await storyService.rewriteInChunks(
              chapter.content,
              streamCallback,
              signal
            );

            // Mark chapter as fully completed
            chapterProgresses[index] = progressPerChapter;
            completedChapters++;
            updateOverallProgress();
            
            resolve(rewrittenContent);
          } catch (error) {
            if (error.name === 'AbortError') {
              resolve(chapter.content); // Return original content if cancelled
            } else {
              console.error(`Error processing chapter ${chapter.title}:`, error);
              resolve(chapter.content); // Return original content on error
            }
          }
        });
      });

      // Wait for all chapters to be processed
      const processedChapters = await Promise.all(chapterPromises);

      // Check if export was cancelled
      if (signal?.aborted) {
        throw new Error('Export cancelled');
      }

      // Set progress to 100% when processing is complete
      if (onProgress) {
        onProgress({
          progress: 100,
          currentChapter: "Finalizing..."
        });
      }

      // Create the story text content with just processed content and 4 newlines between chapters
      const storyContent = processedChapters.join('\n\n\n\n');

      return storyContent;
    } catch (error: any) {
      console.error("Text export process ended:", {
        type: error.message === 'Export cancelled' ? 'Cancellation' : 'Error',
        message: error.message,
        details: error.stack
      });
      throw error;
    }
  }

  public downloadTextFile(content: string, title: string): void {
    // Create and download the file with a meaningful name
    const blob = new Blob([content], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Use the story title for the filename, sanitize it for valid filename
    const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `${sanitizedTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

// Export a singleton instance
export const textExportService = TextExportService.getInstance(); 