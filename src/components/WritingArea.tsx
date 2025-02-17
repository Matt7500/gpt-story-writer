
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { CheckCircle, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface WritingAreaProps {
  chapter: {
    title: string;
    content: string;
    sceneBeat?: string;
  };
  onSave: (content: string) => void;
  onComplete: () => void;
  onFeedback: (feedback: string) => void;
}

export function WritingArea({
  chapter,
  onSave,
  onComplete,
  onFeedback,
}: WritingAreaProps) {
  const [content, setContent] = useState(chapter.content);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const { toast } = useToast();

  const handleSave = () => {
    onSave(content);
    toast({
      title: "Changes saved",
      description: "Your progress has been saved successfully.",
    });
  };

  const handleFeedback = () => {
    if (feedback.trim()) {
      onFeedback(feedback);
      setFeedback("");
      setShowFeedback(false);
      toast({
        title: "Feedback submitted",
        description: "Thank you for your feedback!",
      });
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <div className="writing-area space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{chapter.title}</h1>
          <p className="text-sm text-muted-foreground">
            {wordCount} words • {charCount} characters
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFeedback(true)}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Feedback
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave}>
            Save
          </Button>
          <Button size="sm" onClick={onComplete}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Complete
          </Button>
        </div>
      </div>
      
      {chapter.sceneBeat && (
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm font-medium mb-1">Scene Beat:</p>
          <p className="text-sm text-muted-foreground">{chapter.sceneBeat}</p>
        </div>
      )}

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[calc(100vh-300px)] w-full resize-none text-xl leading-relaxed"
        placeholder="Start writing your story..."
      />
      {showFeedback && (
        <div className="space-y-4 pt-4 border-t">
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What would you like to improve about this scene?"
            className="h-32"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFeedback(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleFeedback}>
              Submit Feedback
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
