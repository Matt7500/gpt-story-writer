import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { 
  CheckCircle, 
  MessageSquare, 
  BookOpen, 
  BookCheck, 
  Users, 
  PenTool,
  Loader2
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { StoryOutlineModal } from "./StoryOutlineModal";
import { FeedbackModal } from "./FeedbackModal";
import { Separator } from "./ui/separator";
import { supabase } from "@/integrations/supabase/client";

interface WritingAreaProps {
  chapter?: {
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
  characters: string;
  onSave: (content: string) => void;
  onComplete: () => void;
  onFeedback: (feedback: string) => void;
  onFinishStory?: () => void;
  onShowCharacters: () => void;
}

export function WritingArea({
  chapter = { title: 'New Chapter', content: '', sceneBeat: '' },
  chapters,
  characters,
  onSave,
  onComplete,
  onFeedback,
  onFinishStory,
  onShowCharacters,
}: WritingAreaProps) {
  const [content, setContent] = useState(chapter.content || '');
  const [showFeedback, setShowFeedback] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Add useEffect to update content when chapter changes
  useEffect(() => {
    setContent(chapter?.content || '');
  }, [chapter]);

  const handleGenerateScene = async () => {
    try {
      setIsGenerating(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      // Create an EventSource for real-time updates
      const clientId = Math.random().toString(36).substring(7);
      const eventSource = new EventSource(`http://localhost:3001/api/stories/write-scene/progress?clientId=${clientId}`);

      let currentContent = "";
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.content) {
          if (data.isPartial) {
            // For partial updates, append to the current content
            currentContent += data.content;
            setContent(currentContent);
            onSave(currentContent);
          } else {
            // For the final update, use the complete content
            setContent(data.content);
            onSave(data.content);
          }
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
      };

      // Start the scene generation
      const response = await fetch('http://localhost:3001/api/stories/write-scene', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          clientId,
          sceneBeat: chapter.sceneBeat,
          characters,
          previousScenes: chapters
            .slice(0, chapters.findIndex(c => c.title === chapter.title))
            .map(c => c.content)
            .filter(Boolean)
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate scene');
      }

      eventSource.close();
    } catch (error: any) {
      toast({
        title: "Error generating scene",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFeedbackSubmit = async (feedback: string) => {
    try {
      setIsRevising(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      // Create an EventSource for real-time updates
      const clientId = Math.random().toString(36).substring(7);
      const eventSource = new EventSource(`http://localhost:3001/api/stories/write-scene/progress?clientId=${clientId}`);

      let currentContent = "";
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.content) {
          if (data.isPartial) {
            // For partial updates, append to the current content
            currentContent += data.content;
            setContent(currentContent);
            onSave(currentContent);
          } else {
            // For the final update, use the complete content
            setContent(data.content);
            onSave(data.content);
          }
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
      };

      // Start the scene revision
      const response = await fetch('http://localhost:3001/api/stories/revise-scene', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          clientId,
          sceneBeat: chapter.sceneBeat,
          characters,
          currentScene: content,
          feedback
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to revise scene');
      }

      eventSource.close();
      toast({
        title: "Scene revised",
        description: "The scene has been updated based on your feedback.",
      });
    } catch (error: any) {
      toast({
        title: "Error revising scene",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRevising(false);
      setShowFeedback(false);
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
        <div className="flex items-center gap-4">
          {/* Writing Tools Group */}
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleGenerateScene}
              disabled={isGenerating || isRevising}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PenTool className="h-4 w-4 mr-2" />
              )}
              {isGenerating ? "Writing..." : "Write Scene"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowOutline(true)}>
              <BookOpen className="h-4 w-4 mr-2" />
              Story Outline
            </Button>
            <Button variant="outline" size="sm" onClick={onShowCharacters}>
              <Users className="h-4 w-4 mr-2" />
              Characters
            </Button>
          </div>

          <Separator orientation="vertical" className="h-8" />

          {/* Feedback Group */}
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowFeedback(true)}
              disabled={isGenerating || isRevising}
            >
              {isRevising ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <MessageSquare className="h-4 w-4 mr-2" />
              )}
              {isRevising ? "Revising..." : "Feedback"}
            </Button>
          </div>
        </div>
      </div>
      
      {chapter.sceneBeat && (
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm font-medium mb-1">Scene Beat:</p>
          <p className="text-sm text-muted-foreground">{chapter.sceneBeat}</p>
        </div>
      )}

      <Textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          onSave(e.target.value);
        }}
        className="w-full h-[calc(100vh-100px)] resize-none text-base leading-relaxed overflow-y-auto"
        placeholder="Start writing the scene..."
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
