import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedback: string) => void;
}

export function FeedbackModal({
  isOpen,
  onClose,
  onSubmit,
}: FeedbackModalProps) {
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (feedback.trim()) {
      setIsSubmitting(true);
      try {
        await onSubmit(feedback);
        setFeedback("");
      } catch (error) {
        console.error("Error submitting feedback:", error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !isSubmitting) {
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-[700px] sm:h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Submit Feedback</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p>What would you like to improve about this scene? You can provide feedback on:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Plot consistency and continuity</li>
                <li>Character development and dialogue</li>
                <li>Pacing and tension</li>
                <li>Description and atmosphere</li>
                <li>Writing style and tone</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Enter your feedback here. Be as specific as possible about what you'd like to change or improve..."
          className="flex-1 min-h-[300px] resize-none"
          disabled={isSubmitting}
        />
        <DialogFooter className="mt-4">
          <Button 
            variant="outline" 
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!feedback.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
