import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PenTool, Sparkles } from "lucide-react";

interface StoryTypeModalProps {
  open: boolean;
  onClose: () => void;
  onManual: () => void;
  onAutomated: () => void;
}

export function StoryTypeModal({
  open,
  onClose,
  onManual,
  onAutomated,
}: StoryTypeModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Story</DialogTitle>
          <DialogDescription>
            Choose how you would like to create your story.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button
            onClick={onManual}
            variant="outline"
            className="w-full h-24 flex flex-col items-center justify-center gap-2"
          >
            <PenTool className="h-6 w-6" />
            <div>
              <div className="font-semibold">Manual Writing</div>
              <div className="text-sm text-muted-foreground">
                Write your story chapter by chapter
              </div>
            </div>
          </Button>
          <Button
            onClick={onAutomated}
            variant="outline"
            className="w-full h-24 flex flex-col items-center justify-center gap-2"
            disabled
          >
            <Sparkles className="h-6 w-6" />
            <div>
              <div className="font-semibold">Fully Automated Story Writing</div>
              <div className="text-sm text-muted-foreground">
                Coming soon - Let AI craft your entire story
              </div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 