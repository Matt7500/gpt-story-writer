import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { CheckCircle, MessageSquare, BookOpen, BookCheck, Users } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  const [feedback, setFeedback] = useState("");
  const { toast } = useToast();

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
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <BookOpen className="h-4 w-4 mr-2" />
                Story Outline
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
              <DialogHeader>
                <DialogTitle>Story Outline</DialogTitle>
                <DialogDescription>
                  A chapter-by-chapter breakdown of your story.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 mt-6">
                {chapters.map((chapter, index) => (
                  <div key={index} className="space-y-2 p-4 rounded-lg bg-muted/50">
                    <h3 className="font-medium">{chapter.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {chapter.sceneBeat}
                    </p>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
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
