import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  CheckCircle, 
  MessageSquare, 
  BookOpen, 
  BookCheck, 
  Users, 
  PenTool,
  Loader2,
  ArrowRightLeft
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { StoryOutlineModal } from "./StoryOutlineModal";
import { FeedbackModal } from "./FeedbackModal";
import { supabase } from "@/integrations/supabase/client";
import { FeedbackDialog } from "./FeedbackDialog";
import { useStoryService } from "@/hooks/use-story-service";
import { cn } from "@/lib/utils";

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
  const [isGeneratingTransition, setIsGeneratingTransition] = useState(false);
  const [currentClientId, setCurrentClientId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const storyService = useStoryService();

  // Add useEffect to update content when chapter changes
  useEffect(() => {
    setContent(chapter?.content || '');
  }, [chapter]);

  // Add cleanup function for cancellation
  const cleanup = () => {
    setIsGenerating(false);
    setIsRevising(false);
    setIsGeneratingTransition(false);
    setCurrentClientId(null);
  };

  // Add cancel function
  const handleCancel = async () => {
    // No need to cancel API requests anymore
    cleanup();
    toast({
      title: "Generation cancelled",
      description: "Scene generation has been cancelled.",
      duration: 3000,
    });
  };

  const handleGenerateScene = async () => {
    try {
      setIsGenerating(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication Error",
          description: "Please sign in to continue.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      // Get previous scenes for context
      const previousScenes = chapters
        .slice(0, chapters.findIndex(c => c.title === chapter.title))
        .map(c => c.content)
        .filter(Boolean);

      // Clear existing content if any
      setContent('');
      
      // Create a variable to accumulate content for saving
      let accumulatedContent = '';
      
      // Use StoryService to generate the scene with streaming updates
      await storyService.writeScene(
        chapter.sceneBeat || '',
        characters,
        previousScenes,
        (chunk) => {
          // Update the UI with each chunk
          accumulatedContent += chunk;
          setContent(accumulatedContent);
          // Save periodically (every ~500 characters)
          if (accumulatedContent.length % 500 < 20) {
            onSave(accumulatedContent);
          }
        }
      );
      
      // Final save to ensure everything is saved
      onSave(accumulatedContent);
      
      // Clean up
      cleanup();
    } catch (error: any) {
      cleanup();
      toast({
        title: "Error generating scene",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleGenerateTransition = async () => {
    try {
      setIsGeneratingTransition(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication Error",
          description: "Please sign in to continue.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      // Find the current chapter index
      const currentChapterIndex = chapters.findIndex(c => c.title === chapter.title);
      
      // Check if there's a previous chapter
      if (currentChapterIndex <= 0 || !chapters[currentChapterIndex - 1].content) {
        toast({
          title: "Cannot generate transition",
          description: "No previous chapter content found.",
          variant: "destructive",
          duration: 3000,
        });
        cleanup();
        return;
      }

      // Get the previous chapter content
      const previousChapterContent = chapters[currentChapterIndex - 1].content;
      
      // Store the original content to add the transition to
      const originalContent = content;
      
      // Create a variable to accumulate the transition
      let transitionText = '';
      
      // Show a temporary placeholder for the transition being generated
      setContent("Generating transition...\n\n" + originalContent);
      
      // Generate the transition with streaming updates
      const transition = await storyService.generateTransition(
        previousChapterContent,
        originalContent,
        chapter.sceneBeat || '',
        (chunk) => {
          // Update the transition text
          transitionText += chunk;
          
          // Update the content in real-time to show the transition being written
          setContent(transitionText + "\n\n" + originalContent);
        }
      );
      
      // Final update with the complete transition
      const newContent = transition + '\n\n' + originalContent;
      setContent(newContent);
      onSave(newContent);
      
      // Clean up
      cleanup();
      
      toast({
        title: "Transition added",
        description: "A smooth transition has been added to the beginning of your chapter.",
        duration: 3000,
      });
    } catch (error: any) {
      cleanup();
      toast({
        title: "Error generating transition",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleFeedbackSubmit = async (feedback: string) => {
    try {
      setIsRevising(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      // Clear existing content if any
      const originalContent = content;
      setContent('');
      
      // Create a variable to accumulate content for saving
      let accumulatedContent = '';
      
      // Use StoryService to revise the scene with streaming updates
      await storyService.reviseScene(
        originalContent,
        feedback,
        chapter.sceneBeat || '',
        characters,
        (chunk) => {
          // Update the UI with each chunk
          accumulatedContent += chunk;
          setContent(accumulatedContent);
          // Save periodically (every ~500 characters)
          if (accumulatedContent.length % 500 < 20) {
            onSave(accumulatedContent);
          }
        }
      );
      
      // Final save to ensure everything is saved
      onSave(accumulatedContent);
      
      // Notify parent about feedback
      onFeedback(feedback);
      
      // Close dialog and clean up
      setShowFeedback(false);
      cleanup();
    } catch (error: any) {
      // Restore original content if there's an error
      setContent(content);
      cleanup();
      toast({
        title: "Error revising scene",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  // Find the current chapter index to determine if there's a previous chapter
  const currentChapterIndex = chapters.findIndex(c => c.title === chapter.title);
  const hasPreviousChapter = currentChapterIndex > 0 && chapters[currentChapterIndex - 1].content;

  // Custom button style for borderless, light background buttons
  const buttonStyle = "border-none bg-gray-100 hover:bg-gray-200 dark:bg-gray-800/40 dark:hover:bg-gray-800/60 text-gray-700 dark:text-gray-300";

  return (
    <div className="writing-area space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{chapter.title}</h1>
            <p className="text-sm text-muted-foreground">
              {wordCount} words • {charCount} characters
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowOutline(true)}
              className={buttonStyle}
            >
              <BookOpen className="h-4 w-4 mr-2" />
              Story Outline
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onShowCharacters}
              className={buttonStyle}
            >
              <Users className="h-4 w-4 mr-2" />
              Characters
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Writing Tools Group */}
          <div className="flex items-center gap-3">
            {isGenerating ? (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={handleCancel}
              >
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cancel Generation
              </Button>
            ) : (
              <Button
                variant="default" 
                size="sm"
                onClick={handleGenerateScene}
                disabled={isGenerating || isRevising || isGeneratingTransition}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <PenTool className="h-4 w-4 mr-2" />
                Write Scene
              </Button>
            )}
            {hasPreviousChapter && (
              isGeneratingTransition ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancel}
                >
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancel Transition
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateTransition}
                  disabled={isGenerating || isRevising || isGeneratingTransition || !content}
                  className={buttonStyle}
                >
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Add Transition
                </Button>
              )
            )}
          </div>

          {/* Feedback Group */}
          <div className="flex items-center">
            {isRevising ? (
              <Button
                variant="destructive" 
                size="sm"
                onClick={handleCancel}
              >
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cancel Revision
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFeedback(true)}
                disabled={isGenerating || isRevising || isGeneratingTransition}
                className={buttonStyle}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Feedback
              </Button>
            )}
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
