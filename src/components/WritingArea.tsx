
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { CheckCircle, MessageSquare, BookOpen, BookCheck, Users } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { StoryOutlineModal } from "./StoryOutlineModal";
import { FeedbackModal } from "./FeedbackModal";

interface WritingAreaProps {
  chapter: {
    title: string;
    content: string;
    sceneBeat?: string;
  };
  chapters: {
    title: string;
    content: string;
    sceneBeat: string;
    completed: boolean;
  }[];
  onSave: (content: string) => void;
  onComplete: () => void;
  onFeedback: (feedback: string) => void;
  onFinishStory?: () => void;
  onShowCharacters: () => void;
}

export function WritingArea({
  chapter,
  chapters,
  onSave,
  onComplete,
  onFeedback,
  onFinishStory,
  onShowCharacters,
}: WritingAreaProps) {
  const [content, setContent] = useState(chapter.content);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const { toast } = useToast();

  const handleFeedbackSubmit = (feedback: string) => {
    onFeedback(feedback);
    toast({
      title: "Feedback submitted",
      description: "Thank you for your feedback!",
    });
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
          <Button variant="outline" size="sm" onClick={() => setShowOutline(true)}>
            <BookOpen className="h-4 w-4 mr-2" />
            Story Outline
          </Button>
          <Button variant="outline" size="sm" onClick={onShowCharacters}>
            <Users className="h-4 w-4 mr-2" />
            Characters
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowFeedback(true)}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Feedback
          </Button>
          <Button size="sm" onClick={onComplete}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Complete
          </Button>
          {onFinishStory && (
            <Button 
              variant="default" 
              size="sm"
              onClick={onFinishStory}
              className="bg-green-600 hover:bg-green-700"
            >
              <BookCheck className="h-4 w-4 mr-2" />
              Finish Story
            </Button>
          )}
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
        onChange={(e) => {
          setContent(e.target.value);
          onSave(e.target.value);
        }}
        className="min-h-[calc(100vh-300px)] w-full resize-none text-xl leading-relaxed"
        placeholder="Start writing your story..."
      />

      <StoryOutlineModal
        isOpen={showOutline}
        onClose={() => setShowOutline(false)}
        chapters={chapters}
      />

      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
        onSubmit={handleFeedbackSubmit}
      />
    </div>
  );
}
