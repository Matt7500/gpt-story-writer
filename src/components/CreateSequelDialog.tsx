import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Story } from "@/types/story";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CreateSequelDialogProps {
  story: Story | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function CreateSequelDialog({ story, onClose, onConfirm }: CreateSequelDialogProps) {
  if (!story) return null;

  // Calculate a reasonable height for the story idea based on content length
  const getIdealHeight = (text: string) => {
    const charCount = text.length;
    // Base height of 250px, plus 1px for every 3 characters, up to a max of 450px
    return Math.min(Math.max(250, charCount / 3), 450);
  };

  const storyIdeaHeight = getIdealHeight(story.story_idea);

  return (
    <Dialog open={!!story} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-xl">Create Sequel</DialogTitle>
          <DialogDescription className="text-base">
            This will generate a new story that continues where "{story.title}" left off.
          </DialogDescription>
        </DialogHeader>
        
        <div className="bg-muted/50 p-4 rounded-md my-4">
          <h4 className="font-medium mb-3 text-base">Original Story Idea:</h4>
          <ScrollArea style={{ height: `${storyIdeaHeight}px` }} type="auto">
            <p className="text-base text-muted-foreground pr-6 leading-relaxed">{story.story_idea}</p>
          </ScrollArea>
        </div>
        
        <DialogFooter className="flex sm:justify-between pt-3">
          <Button variant="outline" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" onClick={onConfirm}>
            Create Sequel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 