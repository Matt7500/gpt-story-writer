import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import { Download, Video, AlertTriangle, Loader2, Music, Upload } from "lucide-react";
import { useState, useRef } from "react";
import { Progress } from "./ui/progress";
import { toast } from "@/components/ui/use-toast";
import { textExportService } from "@/services/TextExportService";
import { audioExportService } from "@/services/AudioExportService";
import { videoExportService } from "@/services/VideoExportService";

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
  const [videoProgress, setVideoProgress] = useState<{
    progress: number;
    stage: 'text' | 'audio' | 'image' | 'video';
    message: string | null;
    requiresUserInput?: boolean;
  } | null>(null);
  const [audioProgress, setAudioProgress] = useState<string | null>(null);
  const [audioGenerationDetails, setAudioGenerationDetails] = useState<{
    currentChapter: number;
    totalChapters: number;
    currentSection: number;
    totalSections: number;
  } | null>(null);
  
  // File input ref for image upload
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      // Use TextExportService to generate the text content
      const storyContent = await textExportService.exportAsText(
        chapters,
        title,
        (progressData) => {
          setProgress(progressData.progress);
          setCurrentChapter(progressData.currentChapter);
        },
        newController.signal
      );

      // Check if export was cancelled
      if (newController.signal.aborted) {
        throw new Error('Export cancelled');
      }

      // Download the file
      textExportService.downloadTextFile(storyContent, title);

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
      setVideoProgress({
        progress: 0,
        stage: 'text',
        message: 'Starting video project...',
        requiresUserInput: false
      });

      // Use VideoExportService to generate the video with the new flow
      await videoExportService.generateVideo(
        chapters,
        title,
        (progressData) => {
          setVideoProgress(progressData);
          
          // If we need the user to upload an image, show the file upload dialog
          if (progressData.requiresUserInput && progressData.stage === 'image') {
            // This will trigger the file input to open
            setTimeout(() => {
              if (fileInputRef.current) {
                fileInputRef.current.click();
              }
            }, 500);
          }
        },
        (imageCallback) => {
          // This function is called when the service needs an image
          // We'll use the fileInputRef to handle the file selection
          const handleFileChange = (event: Event) => {
            const target = event.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
              const file = target.files[0];
              // Call the callback with the selected file
              imageCallback(file);
              
              // Remove the event listener after file selection
              if (fileInputRef.current) {
                fileInputRef.current.removeEventListener('change', handleFileChange);
              }
            }
          };
          
          // Add event listener to the file input
          if (fileInputRef.current) {
            fileInputRef.current.addEventListener('change', handleFileChange);
          }
        }
      );

      // Video generation completed successfully
      setIsGeneratingVideo(false);
      setVideoProgress(null);
      
      toast({
        title: "Video Project Created",
        description: "Your video project has been prepared successfully. Full video generation coming soon!",
      });
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

  const handleGenerateAudio = async () => {
    try {
      setIsGeneratingAudio(true);
      setProgress(0);
      setAudioProgress(null);
      setAudioGenerationDetails(null);
      
      // Create new AbortController for this export
      const newController = new AbortController();
      setController(newController);
      
      // Use AudioExportService to generate the audio
      const audioBlob = await audioExportService.generateAudio(
        chapters,
        title,
        (progressData) => {
          setProgress(progressData.progress);
          setCurrentChapter(progressData.currentChapter);
          setAudioProgress(progressData.progressMessage);
          setAudioGenerationDetails(progressData.generationDetails);
        },
        newController.signal
      );
      
      // Check if export was cancelled
      if (newController.signal.aborted) {
        throw new Error('Audio generation cancelled');
      }
      
      // Download the audio file
      audioExportService.downloadAudioFile(audioBlob, title);
      
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
                <Progress 
                  value={isGeneratingVideo && videoProgress ? videoProgress.progress : progress} 
                  className="w-full" 
                />
                <p className="text-sm text-muted-foreground text-center">
                  {isGeneratingVideo && videoProgress
                    ? (videoProgress.message || 'Starting video generation...') 
                    : isGeneratingAudio
                      ? (audioProgress || 'Starting audio generation...')
                      : (currentChapter 
                          ? `Rewriting ${currentChapter} (${Math.round(progress)}%)` 
                          : 'Starting export...')}
                </p>
                {isGeneratingVideo && videoProgress && videoProgress.stage === 'image' && videoProgress.requiresUserInput && (
                  <div className="flex flex-col items-center gap-2 pt-2">
                    <p className="text-sm font-medium">Select a background image for your video</p>
                    <Button
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Choose Image
                    </Button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*" 
                    />
                  </div>
                )}
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