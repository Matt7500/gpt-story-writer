import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import { Download, Video, AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
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
  const [progress, setProgress] = useState(0);
  const [currentChapter, setCurrentChapter] = useState("");
  const [controller, setController] = useState<AbortController | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [videoProgress, setVideoProgress] = useState<string | null>(null);

  // Handle modal close
  const handleClose = () => {
    if (isExporting && controller) {
      setShowConfirmation(true);
      return;
    }
    onClose();
  };

  const handleConfirmCancel = () => {
    if (controller) {
      controller.abort();
      setIsExporting(false);
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
            {(isExporting || isGeneratingVideo) && (
              <div className="space-y-2">
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-muted-foreground text-center">
                  {isGeneratingVideo 
                    ? (videoProgress || 'Starting video generation...') 
                    : (currentChapter ? `Processing ${currentChapter}...` : 'Starting export...')}
                </p>
              </div>
            )}
            <Button
              onClick={handleDownload}
              disabled={isExporting || isGeneratingVideo}
              className="w-full flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              {isExporting ? "Processing..." : "Download as Text"}
            </Button>
            <Button
              onClick={handleGenerateVideo}
              disabled={isExporting || isGeneratingVideo}
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