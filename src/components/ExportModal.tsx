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
import { useState, useRef, useEffect } from "react";
import { Progress } from "./ui/progress";
import { toast } from "@/components/ui/use-toast";
import { textExportService } from "@/services/TextExportService";
import { videoExportService } from "@/services/VideoExportService";
import { supabase } from "@/integrations/supabase/client";
import { Session } from '@supabase/supabase-js';

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

// Added type for backend job status
interface AudioJobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  error: string | null;
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
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [videoProgress, setVideoProgress] = useState<{
    progress: number;
    stage: 'text' | 'audio' | 'image' | 'video';
    message: string | null;
    requiresUserInput?: boolean;
  } | null>(null);
  const [audioJobId, setAudioJobId] = useState<string | null>(null);
  const [audioStatusMessage, setAudioStatusMessage] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    })

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
      // Clear polling interval on unmount
      clearPolling(); 
    };
  }, []);

  const clearPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log('Polling stopped.');
    }
  };
  
  // Reset audio state helper
  const resetAudioState = () => {
    setIsGeneratingAudio(false);
    setAudioJobId(null);
    setProgress(0);
    setAudioStatusMessage(null);
    setAudioError(null);
    clearPolling();
  }

  // Handle modal close
  const handleClose = () => {
    // Stop polling if modal is closed while job is running
    clearPolling(); 
    // Reset state related to audio generation
    resetAudioState();
    // Also reset other export states if needed
    setIsExporting(false);
    setIsGeneratingVideo(false);
    setCurrentChapter("");
    setVideoProgress(null);
    onClose();
  };

  // Confirmation dialog logic - Note: This doesn't cancel backend job
  const handleConfirmCancel = () => {
    setIsExporting(false); // Stop text export if running
    resetAudioState(); // Stop audio polling and reset state
    // Potentially add logic to stop video generation if needed
    setCurrentChapter("");
    setShowConfirmation(false);
    onClose();
  };

  const handleContinueExport = () => {
    setShowConfirmation(false);
  };
  
  const getBackendUrl = () => {
      return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
  };

  const handleDownload = async () => {
    try {
      setIsExporting(true);
      setProgress(0);

      const storyContent = await textExportService.exportAsText(
        chapters,
        title,
        (progressData) => {
          setProgress(progressData.progress);
          setCurrentChapter(progressData.currentChapter);
        },
        null
      );

      textExportService.downloadTextFile(storyContent, title);

      setIsExporting(false);
      setProgress(0);
      setCurrentChapter("");
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

      await videoExportService.generateVideo(
        chapters,
        title,
        (progressData) => {
          setVideoProgress(progressData);
          
          if (progressData.requiresUserInput && progressData.stage === 'image') {
            setTimeout(() => {
              if (fileInputRef.current) {
                fileInputRef.current.click();
              }
            }, 500);
          }
        },
        (imageCallback) => {
          const handleFileChange = (event: Event) => {
            const target = event.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
              const file = target.files[0];
              imageCallback(file);
              
              if (fileInputRef.current) {
                fileInputRef.current.removeEventListener('change', handleFileChange);
              }
            }
          };
          
          if (fileInputRef.current) {
            fileInputRef.current.addEventListener('change', handleFileChange);
          }
        }
      );

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

  // Function to poll job status
  const pollJobStatus = (jobId: string) => {
    console.log(`Starting polling for job ${jobId}`);
    clearPolling(); // Clear any existing interval first

    pollingIntervalRef.current = setInterval(async () => {
      if (!session) {
          console.warn('Polling stopped: No active session.');
          clearPolling();
          resetAudioState();
          toast({ title: "Authentication Error", description: "Polling stopped. Please log in.", variant: "destructive" });
          return;
      }
      
      try {
        const backendUrl = getBackendUrl();
        console.log(`Polling status for job ${jobId}...`);
        const statusResponse = await fetch(`${backendUrl}/api/export/audio/status/${jobId}`, {
          headers: {
              'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (!statusResponse.ok) {
          // Handle non-200 responses during polling (e.g., 404 job not found)
          console.error(`Polling error: Status ${statusResponse.status}`);
          setAudioError(`Polling error: ${statusResponse.statusText}`);
          clearPolling();
          setIsGeneratingAudio(false); // Stop showing loader
          // Optionally show a toast
          toast({ title: "Polling Error", description: `Could not get job status: ${statusResponse.statusText}`, variant: "destructive" });
          return;
        }

        const statusData: AudioJobStatus = await statusResponse.json();
        console.log('Received status:', statusData);

        setProgress(statusData.progress);
        setAudioStatusMessage(statusData.message);
        setAudioError(statusData.error);

        if (statusData.status === 'completed') {
          console.log(`Job ${jobId} completed!`);
          clearPolling();
          setIsGeneratingAudio(false); // Stop loader
          setProgress(100);
          setAudioStatusMessage('Audio generation complete! Preparing download...');
          toast({ title: "Audio Ready", description: "Your audio file is ready for download." });
          
          // Trigger download
          // Create a temporary link and click it
          const downloadUrl = `${backendUrl}/api/export/audio/result/${jobId}`;
          const link = document.createElement('a');
          link.href = downloadUrl;
          // Need to manually add the Authorization header for download if backend requires it
          // Fetching blob and creating object URL is more robust for auth headers
          fetch(downloadUrl, { 
              headers: { 'Authorization': `Bearer ${session.access_token}` }
          })
          .then(res => {
              if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
              return res.blob();
          })
          .then(blob => {
              const objectUrl = window.URL.createObjectURL(blob);
              link.href = objectUrl;
              link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_audio.mp3`; // Suggest filename
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              window.URL.revokeObjectURL(objectUrl); // Clean up
              // Close modal after successful download (optional)
              setTimeout(() => {
                 handleClose(); // Use handleClose to reset everything
              }, 1500);
          })
          .catch(err => {
              console.error("Download error:", err);
              setAudioError(`Failed to download audio: ${err.message}`);
              toast({ title: "Download Failed", description: err.message, variant: "destructive" });
          });

        } else if (statusData.status === 'failed') {
          console.error(`Job ${jobId} failed: ${statusData.error}`);
          clearPolling();
          setIsGeneratingAudio(false);
          setAudioError(statusData.error || 'Unknown error during generation');
          toast({ title: "Audio Generation Failed", description: statusData.error || 'Unknown error', variant: "destructive" });
        } else {
          // Continue polling if status is 'pending' or 'processing'
          console.log(`Job ${jobId} status: ${statusData.status}. Continuing poll.`);
        }

      } catch (error: any) {
        console.error("Error during polling:", error);
        setAudioError(`Polling failed: ${error.message}`);
        clearPolling();
        setIsGeneratingAudio(false);
        toast({ title: "Polling Error", description: error.message || 'An error occurred while checking status', variant: "destructive" });
      }
    }, 3000); // Poll every 3 seconds
  };

  const handleGenerateAudio = async () => {
    if (!session) {
        toast({ title: "Authentication Error", description: "Please log in again.", variant: "destructive" });
        return;
    }

    resetAudioState(); // Ensure clean state before starting
    setIsGeneratingAudio(true);
    setAudioStatusMessage('Starting audio generation job...');
    
    try {
      const backendUrl = getBackendUrl();
      // 1. Start the job
      const startResponse = await fetch(`${backendUrl}/api/export/audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ chapters, title })
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json().catch(() => ({ error: 'Failed to parse error response' }));
        throw new Error(errorData.error || `Failed to start job: ${startResponse.statusText}`);
      }

      const { jobId } = await startResponse.json();
      setAudioJobId(jobId);
      setAudioStatusMessage('Audio job started. Processing...');
      console.log('Audio generation job started with ID:', jobId);

      // 2. Start polling for status
      pollJobStatus(jobId);

    } catch (error: any) {
      console.error("Error starting audio generation:", error);
      resetAudioState(); // Reset state on failure to start
      setAudioError(error.message || 'Failed to start audio generation');
      toast({
        title: "Audio Generation Error",
        description: error.message || "Failed to start audio generation",
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
                      // Display backend status message for audio, fallback to default
                      ? (audioStatusMessage || 'Starting audio generation...')
                      : (currentChapter 
                          ? `Rewriting ${currentChapter} (${Math.round(progress)}%)` 
                          : 'Starting export...')}
                </p>
                {/* Display audio error if present */} 
                {isGeneratingAudio && audioError && (
                    <p className="text-sm text-red-600 text-center">Error: {audioError}</p>
                )}
                {/* Image upload for video */} 
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
              </div>
            )}
            {/* Buttons */}
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
              {/* Update button text based on state */} 
              {isGeneratingAudio ? (audioStatusMessage ? audioStatusMessage.split(':')[0] : 'Generating...') : "Generate Audio"}
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