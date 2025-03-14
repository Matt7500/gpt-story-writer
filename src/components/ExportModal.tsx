import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import { Download, Video, AlertTriangle, Loader2, Music } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "./ui/progress";
import { userSettingsService } from "@/services/UserSettingsService";
import { toast } from "@/components/ui/use-toast";

interface Chapter {
  title: string;
  content: string;
  completed: boolean;
  sceneBeat: string;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: Chapter[];
  title: string;
}

function ConfirmationDialog({ isOpen, onConfirm, onCancel }: { 
  isOpen: boolean; 
  onConfirm: () => void; 
  onCancel: () => void; 
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Cancel Export?
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel the export? This will stop the processing of all remaining chapters.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onCancel}>
            Continue Export
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Cancel Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExportModal({ isOpen, onClose, chapters, title }: ExportModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentChapter, setCurrentChapter] = useState("");
  const [controller, setController] = useState<AbortController | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [videoProgress, setVideoProgress] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<string | null>(null);
  const [audioGenerationDetails, setAudioGenerationDetails] = useState<{
    currentChapter: number;
    totalChapters: number;
    currentSection: number;
    totalSections: number;
  } | null>(null);

  // Handle modal close
  const handleClose = () => {
    if ((isExporting || isGeneratingAudio) && controller) {
      setShowConfirmation(true);
      return;
    }
    onClose();
  };

  const handleConfirmCancel = () => {
    if (controller) {
      controller.abort();
      setIsExporting(false);
      setIsGeneratingAudio(false);
      setProgress(0);
      setCurrentChapter("");
      setShowConfirmation(false);
      onClose();
    }
  };

  const handleContinueExport = () => {
    setShowConfirmation(false);
  };

  const handleDownload = async () => {
    try {
      setIsExporting(true);
      setProgress(0);

      // Create new AbortController for this export
      const newController = new AbortController();
      setController(newController);

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

      // Process each chapter through rewriteInChunks
      const processedChapters = [];
      for (let i = 0; i < chapters.length; i++) {
        // Check if export was cancelled
        if (newController.signal.aborted) {
          throw new Error('Export cancelled');
        }

        const chapter = chapters[i];
        setCurrentChapter(chapter.title);
        setProgress((i / chapters.length) * 100);

        try {
          const response = await fetch("http://localhost:3001/api/rewrite", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ 
              text: chapter.content,
              useOpenAI: settings.use_openai_for_story_gen,
              model: settings.story_generation_model
            }),
            signal: newController.signal
          });

          if (!response.ok) {
            throw new Error(`Failed to process chapter: ${response.statusText}`);
          }

          const data = await response.json();
          processedChapters.push(data.content || chapter.content);
        } catch (error) {
          if (error.name === 'AbortError') {
            throw new Error('Export cancelled');
          }
          console.error("Error processing chapter:", error);
          processedChapters.push(chapter.content);
        }
      }

      // Check one final time if export was cancelled
      if (newController.signal.aborted) {
        throw new Error('Export cancelled');
      }

      // Set progress to 100% when processing is complete
      setProgress(100);
      setCurrentChapter("Finalizing...");

      // Create the story text content with just processed content and 4 newlines between chapters
      const storyContent = processedChapters.join('\n\n\n\n');

      // Create and download the file with a meaningful name
      const blob = new Blob([storyContent], { type: "text/plain" });
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

      setIsExporting(false);
      setProgress(0);
      setCurrentChapter("");
      setController(null);
      onClose();
    } catch (error: any) {
      console.error("Export process ended:", {
        type: error.message === 'Export cancelled' ? 'Cancellation' : 'Error',
        message: error.message,
        details: error.stack
      });
      setIsExporting(false);
      setProgress(0);
      setCurrentChapter("");
      setController(null);
      // Only show error message if it wasn't a cancellation
      if (error.message !== 'Export cancelled') {
        toast({
          title: "Export Failed",
          description: error.message || "Error exporting story",
          variant: "destructive",
        });
      }
    }
  };

  const handleGenerateVideo = async () => {
    try {
      setIsGeneratingVideo(true);
      
      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Start video generation
      const response = await fetch("http://localhost:3001/api/video/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          title,
          chapters
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start video generation');
      }

      const { videoId } = await response.json();

      // Start polling for status
      const statusInterval = setInterval(async () => {
        const statusResponse = await fetch(`http://localhost:3001/api/video/status/${videoId}`, {
          headers: {
            "Authorization": `Bearer ${session.access_token}`
          }
        });
        
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          setVideoProgress(status.message);
          
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(statusInterval);
            setIsGeneratingVideo(false);
            setVideoProgress(null);
            
            if (status.status === 'completed') {
              // Handle completion (e.g., show download link)
              toast({
                title: "Video Generated",
                description: "Your video has been generated successfully.",
              });
            } else {
              toast({
                title: "Video Generation Failed",
                description: status.error || "Failed to generate video",
                variant: "destructive",
              });
            }
          }
        }
      }, 5000);

      return () => clearInterval(statusInterval);
    } catch (error: any) {
      console.error('Error generating video:', error);
      setIsGeneratingVideo(false);
      setVideoProgress(null);
      toast({
        title: "Error",
        description: error.message || "Failed to generate video",
        variant: "destructive",
      });
    }
  };

  // Function to split text into chunks of approximately 5 paragraphs
  const splitTextIntoChunks = (text: string): string[] => {
    const paragraphs = text.split(/\n+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    
    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') continue;
      
      currentChunk.push(paragraph);
      
      if (currentChunk.length >= 5) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
      }
    }
    
    // Add any remaining paragraphs
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
    }
    
    return chunks;
  };

  // Function to generate audio for a text chunk
  const generateAudioForChunk = async (
    text: string, 
    elevenlabsKey: string, 
    voiceId: string, 
    model: string,
    stability: number,
    similarityBoost: number,
    style?: number,
    speakerBoost?: boolean
  ): Promise<ArrayBuffer> => {
    const requestBody: any = {
      text,
      model_id: model,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost
      }
    };

    // Add style parameter if provided and using multilingual_v2 model
    if (model === "eleven_multilingual_v2") {
      if (style !== undefined) {
        requestBody.style = style;
      }
      if (speakerBoost !== undefined) {
        requestBody.speaker_boost = speakerBoost;
      }
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenlabsKey
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Provide more specific error messages for common issues
      if (errorData.detail?.status === 'invalid_uid') {
        throw new Error(`Invalid ElevenLabs voice ID: "${voiceId}". Please go to Settings and select a valid voice ID from your ElevenLabs account.`);
      } else if (response.status === 401) {
        throw new Error('ElevenLabs API authentication failed. Please check your API key in Settings.');
      } else {
        throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText} ${JSON.stringify(errorData)}`);
      }
    }

    return await response.arrayBuffer();
  };

  // Function to combine audio buffers with a silence gap
  const combineAudioBuffers = async (audioBuffers: ArrayBuffer[]): Promise<Blob> => {
    // Create a silent gap (0.4 seconds)
    const sampleRate = 44100; // Standard sample rate
    const silenceDuration = 0.4; // seconds
    const silenceLength = Math.floor(sampleRate * silenceDuration) * 4; // 4 bytes per sample (16-bit stereo)
    const silenceBuffer = new ArrayBuffer(silenceLength);
    const silenceView = new Uint8Array(silenceBuffer);
    silenceView.fill(0); // Fill with zeros for silence
    
    // Combine all audio buffers with silence gaps
    const combinedChunks: ArrayBuffer[] = [];
    
    for (let i = 0; i < audioBuffers.length; i++) {
      combinedChunks.push(audioBuffers[i]);
      if (i < audioBuffers.length - 1) {
        combinedChunks.push(silenceBuffer);
      }
    }
    
    // Concatenate all chunks into a single buffer
    const totalLength = combinedChunks.reduce((acc, buffer) => acc + buffer.byteLength, 0);
    const result = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const buffer of combinedChunks) {
      result.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }
    
    return new Blob([result], { type: 'audio/mpeg' });
  };

  // Helper function to validate ElevenLabs settings
  const validateElevenLabsSettings = (settings: any) => {
    if (!settings.elevenlabs_key) {
      throw new Error('ElevenLabs API key not configured. Please add it in settings.');
    }
    
    if (!settings.elevenlabs_voice_id) {
      throw new Error('ElevenLabs voice not selected. Please select a voice in settings.');
    }
    
    // ElevenLabs voice IDs are typically 24-character alphanumeric strings
    if (settings.elevenlabs_voice_id.includes('@') || 
        settings.elevenlabs_voice_id.length < 20 || 
        !/^[a-zA-Z0-9]+$/.test(settings.elevenlabs_voice_id)) {
      throw new Error(
        'Invalid ElevenLabs voice ID format. Please go to Settings and select a valid voice ID. ' +
        'Voice IDs can be found in your ElevenLabs account under "Profile" > "API Key".'
      );
    }
    
    if (!settings.elevenlabs_model) {
      throw new Error('ElevenLabs model not selected. Please select a model in settings.');
    }
    
    return {
      key: settings.elevenlabs_key,
      voiceId: settings.elevenlabs_voice_id,
      model: settings.elevenlabs_model,
      stability: settings.voice_stability ?? 0.75,
      similarityBoost: settings.voice_similarity_boost ?? 0.75,
      voiceStyle: settings.voice_style,
      speakerBoost: settings.voice_speaker_boost
    };
  };

  const handleGenerateAudio = async () => {
    try {
      setIsGeneratingAudio(true);
      setProgress(0);
      
      // Create new AbortController for this export
      const newController = new AbortController();
      setController(newController);
      
      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      // Get user settings
      userSettingsService.clearCache(session.user.id);
      const settings = await userSettingsService.getSettings(session.user.id);
      
      // Validate ElevenLabs settings and get voice parameters
      const voiceParams = validateElevenLabsSettings(settings);
      
      // Set initial progress
      setAudioProgress('Preparing chapters for audio generation...');
      
      // Prepare all chapters and their chunks
      const chapterProcessingData = chapters.map((chapter, index) => ({
        index,
        title: chapter.title,
        chunks: splitTextIntoChunks(chapter.content)
      }));
      
      // Total number of chunks across all chapters for progress calculation
      const totalChunks = chapterProcessingData.reduce((sum, chapter) => sum + chapter.chunks.length, 0);
      let processedChunks = 0;
      
      // Process all chapters in parallel
      const chapterAudioPromises = chapterProcessingData.map(async (chapterData) => {
        // Check if generation was cancelled
        if (newController.signal.aborted) {
          throw new Error('Audio generation cancelled');
        }
        
        const { index, title, chunks } = chapterData;
        
        // Process each chunk in sequence for this chapter
        const chunkAudioBuffers: ArrayBuffer[] = [];
        
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          // Check if generation was cancelled
          if (newController.signal.aborted) {
            throw new Error('Audio generation cancelled');
          }
          
          // Update progress for this specific chunk
          setCurrentChapter(title);
          setAudioGenerationDetails({
            currentChapter: index + 1,
            totalChapters: chapters.length,
            currentSection: chunkIndex + 1,
            totalSections: chunks.length
          });
          
          setAudioProgress(
            `Generating audio for Chapter ${index + 1}/${chapters.length}, Section ${chunkIndex + 1}/${chunks.length}`
          );
          
          // Generate audio for this chunk
          try {
            const audioBuffer = await generateAudioForChunk(
              chunks[chunkIndex],
              voiceParams.key,
              voiceParams.voiceId,
              voiceParams.model,
              voiceParams.stability,
              voiceParams.similarityBoost,
              voiceParams.voiceStyle,
              voiceParams.speakerBoost
            );
            
            chunkAudioBuffers.push(audioBuffer);
            
            // Update overall progress
            processedChunks++;
            setProgress((processedChunks / totalChunks) * 100);
            
          } catch (error) {
            console.error(`Error generating audio for chunk ${chunkIndex + 1} of chapter ${index + 1}:`, error);
            throw error;
          }
        }
        
        // Combine all chunks for this chapter
        const chapterAudioBuffer = await combineAudioBuffers(chunkAudioBuffers);
        return chapterAudioBuffer.arrayBuffer();
      });
      
      // Wait for all chapter audio generation to complete
      setAudioProgress('Finalizing all chapters...');
      const chapterAudioBuffers = await Promise.all(chapterAudioPromises);
      
      // Combine all chapter audio files
      setAudioProgress('Combining all chapters into final audio file...');
      const finalAudioBlob = await combineAudioBuffers(chapterAudioBuffers);
      
      // Create download link
      const url = URL.createObjectURL(finalAudioBlob);
      const a = document.createElement('a');
      a.href = url;
      const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `${sanitizedTitle}_audio.mp3`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Reset state
      setIsGeneratingAudio(false);
      setProgress(100);
      setAudioProgress('Audio generation complete!');
      setController(null);
      
      // Show success message
      toast({
        title: "Audio Generated",
        description: "Your audio file has been generated and downloaded successfully.",
      });
      
      // Close modal after a short delay
      setTimeout(() => {
        setProgress(0);
        setAudioProgress(null);
        setAudioGenerationDetails(null);
        onClose();
      }, 2000);
      
    } catch (error: any) {
      console.error("Audio generation process ended:", {
        type: error.message === 'Audio generation cancelled' ? 'Cancellation' : 'Error',
        message: error.message,
        details: error.stack
      });
      
      setIsGeneratingAudio(false);
      setProgress(0);
      setAudioProgress(null);
      setAudioGenerationDetails(null);
      setController(null);
      
      // Only show error message if it wasn't a cancellation
      if (error.message !== 'Audio generation cancelled') {
        const isVoiceIdError = error.message.includes('Invalid ElevenLabs voice ID') || 
                              error.message.includes('invalid_uid');
        
        toast({
          title: "Audio Generation Failed",
          description: error.message || "Error generating audio",
          variant: "destructive",
          action: isVoiceIdError ? (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                // You can add navigation to settings here if you have a settings page
                toast({
                  title: "ElevenLabs Setup",
                  description: "Go to Settings and update your ElevenLabs voice ID. You can find your voice IDs in your ElevenLabs account dashboard.",
                });
              }}
            >
              Help
            </Button>
          ) : undefined,
        });
      }
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Export Story</DialogTitle>
            <DialogDescription>
              Choose how you would like to export your story.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {(isExporting || isGeneratingVideo || isGeneratingAudio) && (
              <div className="space-y-2">
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-muted-foreground text-center">
                  {isGeneratingVideo 
                    ? (videoProgress || 'Starting video generation...') 
                    : isGeneratingAudio
                      ? (audioProgress || 'Starting audio generation...')
                      : (currentChapter ? `Processing ${currentChapter}...` : 'Starting export...')}
                </p>
                {isGeneratingAudio && audioGenerationDetails && (
                  <p className="text-xs text-muted-foreground text-center">
                    Chapter {audioGenerationDetails.currentChapter}/{audioGenerationDetails.totalChapters}, 
                    Section {audioGenerationDetails.currentSection}/{audioGenerationDetails.totalSections}
                  </p>
                )}
              </div>
            )}
            <Button
              onClick={handleDownload}
              disabled={isExporting || isGeneratingVideo || isGeneratingAudio}
              className="w-full flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              {isExporting ? "Processing..." : "Download as Text"}
            </Button>
            <Button
              onClick={handleGenerateAudio}
              disabled={isExporting || isGeneratingVideo || isGeneratingAudio}
              className="w-full flex items-center justify-center gap-2"
            >
              {isGeneratingAudio ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Music className="h-4 w-4" />
              )}
              {isGeneratingAudio ? "Generating..." : "Generate Audio"}
            </Button>
            <Button
              onClick={handleGenerateVideo}
              disabled={isExporting || isGeneratingVideo || isGeneratingAudio}
              className="w-full flex items-center justify-center gap-2"
            >
              {isGeneratingVideo ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Video className="h-4 w-4" />
              )}
              {isGeneratingVideo ? "Generating..." : "Generate Video"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog 
        isOpen={showConfirmation}
        onConfirm={handleConfirmCancel}
        onCancel={handleContinueExport}
      />
    </>
  );
} 