import { supabase } from "@/integrations/supabase/client";
import { textExportService } from "@/services/TextExportService";
import { audioExportService } from "@/services/AudioExportService";

interface Chapter {
  title: string;
  content: string;
  completed: boolean;
  sceneBeat: string;
}

interface VideoGenerationProgress {
  progress: number;
  stage: 'text' | 'audio' | 'image' | 'video';
  message: string | null;
  requiresUserInput?: boolean;
}

export class VideoExportService {
  private static instance: VideoExportService;

  private constructor() {}

  public static getInstance(): VideoExportService {
    if (!VideoExportService.instance) {
      VideoExportService.instance = new VideoExportService();
    }
    return VideoExportService.instance;
  }

  public async generateVideo(
    chapters: Chapter[], 
    title: string, 
    onProgress?: (progress: VideoGenerationProgress) => void,
    onRequestImageUpload?: (callback: (imageFile: File) => void) => void
  ): Promise<void> {
    try {
      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // STEP 1: Process text using TextExportService
      if (onProgress) {
        onProgress({
          progress: 0,
          stage: 'text',
          message: 'Starting text processing...'
        });
      }

      // Use TextExportService to process the text
      const processedText = await textExportService.exportAsText(
        chapters,
        title,
        (textProgress) => {
          if (onProgress) {
            onProgress({
              progress: textProgress.progress * 0.3, // Text processing is 30% of total progress
              stage: 'text',
              message: `Processing text: ${textProgress.currentChapter}`
            });
          }
        }
      );

      // STEP 2: Generate audio using AudioExportService
      if (onProgress) {
        onProgress({
          progress: 30,
          stage: 'audio',
          message: 'Starting audio generation...'
        });
      }

      // Use AudioExportService to generate audio
      const audioBlob = await audioExportService.generateAudio(
        chapters,
        title,
        (audioProgress) => {
          if (onProgress) {
            onProgress({
              progress: 30 + (audioProgress.progress * 0.6), // Audio is 60% of total progress (30%-90%)
              stage: 'audio',
              message: audioProgress.progressMessage || 'Generating audio...'
            });
          }
        }
      );

      // STEP 3: Prompt the user to upload a background image
      if (onProgress) {
        onProgress({
          progress: 90,
          stage: 'image',
          message: 'Please upload a background image for your video',
          requiresUserInput: true
        });
      }

      // Wait for the user to upload an image
      if (!onRequestImageUpload) {
        throw new Error('Image upload handler not provided');
      }

      const backgroundImage = await new Promise<File>((resolve, reject) => {
        onRequestImageUpload((imageFile) => {
          if (imageFile) {
            resolve(imageFile);
          } else {
            reject(new Error('No image provided'));
          }
        });
      });

      // Future implementation: Send to server for video generation with Remotion
      if (onProgress) {
        onProgress({
          progress: 95,
          stage: 'video',
          message: 'Preparing video generation...'
        });
      }

      // For now, we'll store the processed text, audio, and image data for future Remotion integration
      const projectData = {
        title,
        processedText,
        audioBlob,
        backgroundImage: backgroundImage.name,
        timestamp: new Date().toISOString()
      };

      // Store the project data in localStorage for now (will be replaced with proper storage later)
      localStorage.setItem(`video_project_${Date.now()}`, JSON.stringify({
        title: projectData.title,
        processedText: 'Content stored separately',
        audioBlob: 'Blob stored separately',
        backgroundImage: projectData.backgroundImage,
        timestamp: projectData.timestamp
      }));

      // Complete the process
      if (onProgress) {
        onProgress({
          progress: 100,
          stage: 'video',
          message: 'Video project prepared successfully. Remotion integration coming soon!'
        });
      }
    } catch (error: any) {
      console.error('Error in video generation process:', error);
      throw error;
    }
  }

  // This will be implemented later with Remotion integration
  private async generateVideoWithRemotion(
    processedText: string,
    audioBlob: Blob,
    backgroundImage: File,
    title: string,
    session: any
  ): Promise<string> {
    // For future implementation with Remotion
    // This will handle the actual video generation using the processed text, audio, and background image
    
    // Mock implementation for now
    return new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve('video_url_placeholder');
      }, 1000);
    });
  }
}

// Export a singleton instance
export const videoExportService = VideoExportService.getInstance(); 