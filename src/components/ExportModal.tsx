import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import { Download, Video } from "lucide-react";
import { useState } from "react";

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
}

export function ExportModal({ isOpen, onClose, chapters }: ExportModalProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleDownload = async () => {
    try {
      setIsExporting(true);

      // Process each chapter through callTune4
      const processedChapters = await Promise.all(
        chapters.map(async (chapter) => {
          try {
            const response = await fetch("/api/tune4", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ scene: chapter.content }),
            });

            if (!response.ok) {
              throw new Error(`Failed to process chapter: ${response.statusText}`);
            }

            const data = await response.json();
            return data.content || chapter.content; // Fallback to original content if processing fails
          } catch (error) {
            console.error("Error processing chapter:", error);
            return chapter.content; // Fall back to original content if processing fails
          }
        })
      );

      // Create the story text content with just processed content and 4 newlines between chapters
      const storyContent = processedChapters.join('\n\n\n\n');

      // Create and download the file with a meaningful name
      const blob = new Blob([storyContent], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `story_export_${new Date().toISOString().split("T")[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setIsExporting(false);
      onClose();
    } catch (error) {
      console.error("Error exporting story:", error);
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export Story</DialogTitle>
          <DialogDescription>
            Choose how you would like to export your story.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
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
  );
} 