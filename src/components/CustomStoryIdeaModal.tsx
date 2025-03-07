import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface CustomStoryIdeaModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (storyIdea: string) => void;
}

export function CustomStoryIdeaModal({ open, onClose, onSubmit }: CustomStoryIdeaModalProps) {
  const [storyIdea, setStoryIdea] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!storyIdea.trim()) return;
    
    setIsSubmitting(true);
    try {
      onSubmit(storyIdea);
      setStoryIdea("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Enter Your Story Idea</DialogTitle>
          <DialogDescription>
            Provide your own story idea to use as the foundation for your new story.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <Textarea
            placeholder="Enter your story idea here..."
            value={storyIdea}
            onChange={(e) => setStoryIdea(e.target.value)}
            className="min-h-[200px] resize-none"
          />
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!storyIdea.trim() || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Story"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 