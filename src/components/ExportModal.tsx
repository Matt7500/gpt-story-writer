import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import { Download, Video, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "./ui/progress";
import { userSettingsService } from "@/services/UserSettingsService";

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
  const [progress, setProgress] = useState(0);
  const [currentChapter, setCurrentChapter] = useState("");
  const [controller, setController] = useState<AbortController | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

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
      if (!settings.rewrite_model) {
        throw new Error('Rewrite model not configured. Please configure it in settings.');
      }

      // Process each chapter through callTune4
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
          const response = await fetch("http://localhost:3001/api/tune4", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ 
              scene: chapter.content,
              model: settings.rewrite_model
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
        alert(error.message || "Error exporting story");
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
            {isExporting && (
              <div className="space-y-2">
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-muted-foreground text-center">
                  {currentChapter ? `Processing ${currentChapter}...` : 'Starting export...'}
                </p>
              </div>
            )}
            <Button
              onClick={handleDownload}
              disabled={isExporting}
              className="w-full flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              {isExporting ? "Processing..." : "Download as Text"}
            </Button>
            <Button
              disabled
              variant="secondary"
              className="w-full flex items-center justify-center gap-2"
            >
              <Video className="h-4 w-4" />
              Create Video (Coming Soon)
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