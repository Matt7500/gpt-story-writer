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
  ArrowRightLeft,
  Wand2
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
  const [isRefining, setIsRefining] = useState(false);
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
    setIsRefining(false);
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

  const handleRefineText = async () => {
    // Store the original content before we start processing
    const savedContent = content;
    
    try {
      setIsRefining(true);
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
      
      // Don't clear the content yet - keep the original text visible while processing
      // We'll clear it just before streaming the final result
      
      // Split the content into narration and dialogue sections
      const sections = splitIntoSections(savedContent);
      
      // Create variables to accumulate the refined content
      let processedSections: string[] = [];
      let buffer: string[] = [];
      
      // Show a toast to indicate processing has started
      toast({
        title: "Processing text",
        description: "Refining your text with both models. This may take a moment...",
        duration: 5000,
      });
      
      // First, process all sections without updating the text area
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        
        // Process the section
        let processedSection: string;
        if (isDialogueSection(section)) {
          // If it's a dialogue section, keep it as is
          processedSection = section;
        } else {
          // For narration, process it with both models
          processedSection = await processTwoPassNarration(section);
        }
        
        // Add to buffer and processed sections
        buffer.push(processedSection);
        processedSections.push(processedSection);
      }
      
      // Now that all processing is complete, clear the text area and stream the final result
      // Clear the content before streaming
      setContent('');
      
      // Stream the entire processed content
      const finalContent = processedSections.join('');
      await streamOutput(finalContent);
      
      // Final save to ensure everything is saved
      setContent(finalContent);
      onSave(finalContent);
      
      // Clean up
      cleanup();
      
      toast({
        title: "Text refined",
        description: "Your text has been refined with both models.",
        duration: 3000,
      });
    } catch (error: any) {
      // Restore original content if there's an error
      setContent(savedContent);
      cleanup();
      toast({
        title: "Error refining text",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    }
  };
  
  // Helper function to split content into narration and dialogue sections
  const splitIntoSections = (text: string): string[] => {
    const lines = text.split('\n');
    const sections: string[] = [];
    let currentSection = '';
    let isCurrentDialogue = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLineDialogue = line.trim().startsWith('"');
      
      // If we're switching between dialogue and narration, start a new section
      if (i > 0 && isLineDialogue !== isCurrentDialogue) {
        sections.push(currentSection);
        currentSection = '';
      }
      
      currentSection += line + '\n';
      isCurrentDialogue = isLineDialogue;
    }
    
    // Add the last section if it's not empty
    if (currentSection.trim()) {
      sections.push(currentSection);
    }
    
    return sections;
  };
  
  // Helper function to check if a section is dialogue
  const isDialogueSection = (section: string): boolean => {
    return section.trim().startsWith('"');
  };
  
  // Helper function to process narration with the story generation model first, then the fine-tune model
  const processTwoPassNarration = async (section: string): Promise<string> => {
    try {
      
      // Second pass: Process with fine-tune model
      const secondPassResult = await storyService.rewriteInChunks(section);
      
      return secondPassResult;
    } catch (err) {
      console.error('Error in two-pass processing:', err);
      // On error, return the original section
      return section;
    }
  };
  
  // Helper function to process text with the story generation model
  const processWithStoryModel = async (text: string): Promise<string> => {
    try {
      // Split text into paragraphs
      const paragraphs = text.split('\n\n').filter(p => p.trim());
      const chunks = [];
      let currentChunk = [];
      const processedChunks = [];

      // Group paragraphs into chunks of 3 or less
      for (const paragraph of paragraphs) {
        currentChunk.push(paragraph);
        if (currentChunk.length === 3) {
          chunks.push(currentChunk.join('\n\n'));
          currentChunk = [];
        }
      }

      // Add any remaining paragraphs
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
      }
      
      // Process each chunk using the same approach as writeScene but with our custom prompt
      for (const chunk of chunks) {
        // Get session for authentication
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("No active session");
        
        // Create a custom prompt for improving the narrative
        const prompt = `
Eliminate all appositive phrases relating to people or objects, except those that contain foreshadowing.
Eliminate all absolute phrases relating to people or objects, except those that provide sensory information or describe physical sensations.
Eliminate all metaphors in the text.
Eliminate all sentences that add unnecessary detail or reflection without contributing new information to the scene.
Eliminate all sentences that hinder the pacing of the scene by adding excessive descriptions of the environment, atmosphere, or setting unless they directly affect character actions or emotions.
Eliminate all phrases that mention the character's heart pounding or heart in their throat.
If a paragraph doesn't need to be changed, leave it as is in the returned text.

Only respond with the modified text and nothing else.

Text to edit:
${chunk}
`;

        // Use a similar approach to what's used in writeScene but with our custom prompt
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            model: 'gpt-4o', // Use the main model for the first pass
            temperature: 0.7,
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to process text with story model');
        }
        
        const result = await response.text();
        processedChunks.push(result || chunk);
      }
      
      // Combine all processed chunks
      return processedChunks.join('\n\n');
    } catch (err) {
      console.error('Error processing with story model:', err);
      // On error, return the original text
      return text;
    }
  };

  // Helper function to stream output at 10 words per second
  const streamOutput = async (text: string): Promise<void> => {
    return new Promise((resolve) => {
      // If there's no text to stream, resolve immediately
      if (!text) {
        resolve();
        return;
      }
      
      // Split the text into words with spaces and punctuation preserved
      const words = text.match(/\S+|\s+/g) || [];
      let displayedText = '';
      let wordIndex = 0;
      let nonSpaceWordCount = 0;
      
      // Stream at 10 words per second (100ms per word)
      const interval = setInterval(() => {
        if (wordIndex >= words.length) {
          clearInterval(interval);
          // Ensure the final text is exactly what was processed
          setContent(text);
          onSave(text);
          resolve();
          return;
        }
        
        // Add the next word to the displayed text
        const word = words[wordIndex];
        displayedText += word;
        setContent(displayedText);
        
        // Only count non-space words for the 10 words per second rate
        if (!/^\s+$/.test(word)) {
          nonSpaceWordCount++;
          // Save periodically (every 20 actual words)
          if (nonSpaceWordCount % 20 === 0) {
            onSave(displayedText);
          }
        }
        
        wordIndex++;
      }, 100); // 100ms = 10 words per second
    });
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
                disabled={isGenerating || isRevising || isGeneratingTransition || isRefining}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <PenTool className="h-4 w-4 mr-2" />
                Write Scene
              </Button>
            )}
            
            {/* Add the Refine Text button */}
            {isRefining ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
              >
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cancel Refinement
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefineText}
                disabled={isGenerating || isRevising || isGeneratingTransition || isRefining || !content}
                className={buttonStyle}
              >
                <Wand2 className="h-4 w-4 mr-2" />
                Refine Text
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
                  disabled={isGenerating || isRevising || isGeneratingTransition || isRefining || !content}
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
                disabled={isGenerating || isRevising || isGeneratingTransition || isRefining}
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
          <p className="text-sm font-medium mb-1">Chapter Summary:</p>
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
