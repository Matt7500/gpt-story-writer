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
import { v4 as uuidv4 } from "uuid";

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
  const currentClientIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const storyService = useStoryService();
  const [isTabVisible, setIsTabVisible] = useState(!document.hidden);

  // Add useEffect to update content when chapter changes
  useEffect(() => {
    setContent(chapter?.content || '');
  }, [chapter]);

  // Add visibility change listener to ensure processing continues in background
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(!document.hidden);
    };

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Add cleanup function for cancellation
  const cleanup = () => {
    setIsGenerating(false);
    setIsRevising(false);
    setIsGeneratingTransition(false);
    setIsRefining(false);
    currentClientIdRef.current = null;
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

      // Get future scenes for context
      const currentChapterIndex = chapters.findIndex(c => c.title === chapter.title);
      const futureSceneBeats = chapters
        .slice(currentChapterIndex + 1)
        .map(c => c.sceneBeat)
        .filter(Boolean);

      // Clear existing content if any
      setContent('');
      
      // Create a variable to accumulate content for saving
      let accumulatedContent = '';
      
      // Generate a unique client ID for this generation session
      const clientId = uuidv4();
      // Use ref instead of state to avoid async state update issues
      currentClientIdRef.current = clientId;
      
      console.log('Starting scene generation with client ID:', clientId);
      console.log('Current client ID ref value:', currentClientIdRef.current);
      
      // Show a toast to indicate generation has started
      toast({
        title: "Generating Scene",
        description: "Starting scene generation. This may take a moment...",
        duration: 5000,
      });
      
      // Create a worker-like approach using a self-executing async function
      // This will continue running even when the tab is not active
      (async () => {
        try {
          // Only proceed if this is still the current generation session
          console.log('Checking client ID match:', clientId, currentClientIdRef.current);
          if (clientId !== currentClientIdRef.current) {
            console.log('Client ID mismatch, aborting generation');
            return;
          }
          
          console.log('Calling storyService.writeScene...');
          // Generate the scene
          const generatedScene = await storyService.writeScene(
            chapter.sceneBeat || '',
            characters,
            previousScenes,
            (chunk) => {
              // Only update if this is still the current generation session
              if (clientId === currentClientIdRef.current) {
                accumulatedContent += chunk;
                setContent(prev => prev + chunk);
              } else {
                console.log('Client ID mismatch in chunk callback, ignoring chunk');
              }
            },
            undefined, // Signal parameter
            futureSceneBeats // Pass future scene beats
          );
          
          console.log('Scene generation complete, length:', generatedScene?.length || 0);
          console.log('Checking client ID match before finalizing:', clientId, currentClientIdRef.current);
          
          // Only finalize if this is still the current generation session
          if (clientId === currentClientIdRef.current) {
            console.log('Client ID still matches, finalizing...');
            
            // Save the final content - no need to stream it again since we've already
            // been updating the content in real-time during generation
            onSave(accumulatedContent);
            
            // Only cleanup if this is still the current generation session
            cleanup();
            toast({
              title: "Scene Generated",
              description: "Your scene has been successfully generated.",
              duration: 3000,
            });
          } else {
            console.log('Client ID mismatch after generation, aborting finalization');
          }
        } catch (error: any) {
          console.error("Error generating scene:", error);
          if (clientId === currentClientIdRef.current) {
            // Extract the error message
            const errorMessage = error.message || "Failed to generate scene. Please try again.";
            
            toast({
              title: "Error",
              description: errorMessage,
              variant: "destructive",
              duration: 5000,
            });
            cleanup();
          }
        }
      })();
      
    } catch (error: any) {
      console.error("Error in handleGenerateScene:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate scene. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
      cleanup();
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
      
      // Generate a unique client ID for this transition session
      const clientId = uuidv4();
      currentClientIdRef.current = clientId;
      
      // Create a worker-like approach using a self-executing async function
      // This will continue running even when the tab is not active
      (async () => {
        try {
          // Only proceed if this is still the current transition session
          if (clientId !== currentClientIdRef.current) return;
          
          // Create a variable to accumulate the transition
          let transitionText = '';
          
          // Show a temporary placeholder for the transition being generated
          if (clientId === currentClientIdRef.current) {
            setContent("Generating transition...\n\n" + originalContent);
          }
          
          // Generate the transition with streaming updates
          const transition = await storyService.generateTransition(
            previousChapterContent,
            originalContent,
            chapter.sceneBeat || '',
            (chunk) => {
              // Only update if this is still the current transition session
              if (clientId === currentClientIdRef.current) {
                // Update the transition text
                transitionText += chunk;
                
                // Update the content in real-time to show the transition being written
                setContent(transitionText + "\n\n" + originalContent);
              }
            }
          );
          
          // Only proceed if this is still the current transition session
          if (clientId === currentClientIdRef.current) {
            // Set the final content directly without streaming it again
            const newContent = transition + '\n\n' + originalContent;
            setContent(newContent);
            
            // Clean up
            cleanup();
            
            toast({
              title: "Transition added",
              description: "A smooth transition has been added to the beginning of your chapter.",
              duration: 3000,
            });
          }
        } catch (error) {
          console.error("Error generating transition:", error);
          if (clientId === currentClientIdRef.current) {
            toast({
              title: "Error",
              description: "Failed to generate transition. Please try again.",
              variant: "destructive",
              duration: 3000,
            });
            setContent(originalContent); // Restore original content
            cleanup();
          }
        }
      })();
      
    } catch (error: any) {
      console.error("Error in handleGenerateTransition:", error);
      toast({
        title: "Error",
        description: "Failed to generate transition. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
      cleanup();
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
      
      // Generate a unique client ID for this revision session
      const clientId = uuidv4();
      currentClientIdRef.current = clientId;
      
      // Create a worker-like approach using a self-executing async function
      // This will continue running even when the tab is not active
      (async () => {
        try {
          // Only proceed if this is still the current revision session
          if (clientId !== currentClientIdRef.current) return;
          
          // Revise the scene
          const revisedScene = await storyService.reviseScene(
            originalContent,
            feedback,
            chapter.sceneBeat || '',
            characters,
            (chunk) => {
              // Only update if this is still the current revision session
              if (clientId === currentClientIdRef.current) {
                accumulatedContent += chunk;
                setContent(prev => prev + chunk);
              }
            }
          );
          
          // Process the revised scene with the story model
          if (clientId === currentClientIdRef.current) {
            await streamOutput(revisedScene || accumulatedContent, clientId);
            
            // Notify parent about feedback
            onFeedback(feedback);
            
            // Close dialog and clean up
            setShowFeedback(false);
            cleanup();
          }
        } catch (error) {
          console.error("Error revising scene:", error);
          if (clientId === currentClientIdRef.current) {
            toast({
              title: "Error",
              description: "Failed to revise scene. Please try again.",
              variant: "destructive",
              duration: 3000,
            });
            setContent(originalContent); // Restore original content
            setShowFeedback(false);
            cleanup();
          }
        }
      })();
      
    } catch (error: any) {
      console.error("Error in handleFeedbackSubmit:", error);
      toast({
        title: "Error",
        description: "Failed to revise scene. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
      cleanup();
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
      
      // Generate a unique client ID for this refinement session
      const clientId = uuidv4();
      currentClientIdRef.current = clientId;
      
      // Create a worker-like approach using a self-executing async function
      // This will continue running even when the tab is not active
      (async () => {
        try {
          // Only proceed if this is still the current refinement session
          if (clientId !== currentClientIdRef.current) return;
          
          // Show a toast to indicate processing has started
          toast({
            title: "Processing text",
            description: "Refining your text. This may take a moment...",
            duration: 5000,
          });
          
          // Set a temporary message to show processing is happening
          setContent("Refining your text... Please wait...\n\n" + savedContent);
          
          // Split the content into narration and dialogue sections
          const sections = splitIntoSections(savedContent);
          
          // Count how many narrative sections we need to process
          const narrativeSections = sections.filter(section => 
            section.trim() && !isDialogueSection(section) && !/^\s+$/.test(section)
          );
          
          console.log(`Total sections: ${sections.length}, Narrative sections to process: ${narrativeSections.length}`);
          
          // Create variables to accumulate the refined content
          let processedSections: string[] = [];
          let processedNarrativeCount = 0;
          
          // First, process all sections without updating the text area
          for (let i = 0; i < sections.length; i++) {
            // Only proceed if this is still the current refinement session
            if (clientId !== currentClientIdRef.current) return;
            
            const section = sections[i];
            
            // Process the section
            let processedSection: string;
            
            // Only process non-empty, non-dialogue sections
            if (section.trim() && !isDialogueSection(section) && !/^\s+$/.test(section)) {
              // Update the status message to show progress
              processedNarrativeCount++;
              const progressPercent = Math.round((processedNarrativeCount / narrativeSections.length) * 100);
              setContent(`Refining your text... ${progressPercent}% complete\n\n` + savedContent);
              
              // Process narrative section
              processedSection = await processTwoPassNarration(section);
            } else {
              // Keep dialogue, whitespace, and empty sections as is
              processedSection = section;
            }
            
            // Add to processed sections
            processedSections.push(processedSection);
          }
          
          // Now that all processing is complete, update the content immediately
          // Only proceed if this is still the current refinement session
          if (clientId === currentClientIdRef.current) {
            // Combine all processed sections exactly as they were
            const finalContent = processedSections.join('');
            
            // Set the content directly without streaming
            setContent(finalContent);
            
            // Save the content
            onSave(finalContent);
            
            // Show success toast
            toast({
              title: "Text refined",
              description: "Your text has been successfully refined.",
              duration: 3000,
            });
            
            // Clean up
            cleanup();
          }
        } catch (error) {
          console.error("Error refining text:", error);
          if (clientId === currentClientIdRef.current) {
            toast({
              title: "Error",
              description: "Failed to refine text. Please try again.",
              variant: "destructive",
              duration: 3000,
            });
            setContent(savedContent); // Restore original content
            cleanup();
          }
        }
      })();
      
    } catch (error: any) {
      console.error("Error in handleRefineText:", error);
      toast({
        title: "Error",
        description: "Failed to refine text. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
      setContent(savedContent); // Restore original content
      cleanup();
    }
  };
  
  // Helper function to split content into narration and dialogue sections
  const splitIntoSections = (text: string): string[] => {
    // Preserve exact formatting by splitting on paragraph boundaries
    // This regex captures paragraph breaks with their exact formatting
    const paragraphRegex = /(\n\n+|\n+)/;
    const parts = text.split(paragraphRegex);
    
    // Process parts: text, separator, text, separator, etc.
    const sections: string[] = [];
    let currentSection = '';
    let currentType = '';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      // If this is a separator (newlines), add it to the current section
      if (paragraphRegex.test(part)) {
        if (currentSection) {
          currentSection += part;
        } else {
          // If we don't have a current section, this is a leading separator
          sections.push(part);
        }
        continue;
      }
      
      // Skip empty parts but preserve them
      if (!part.trim()) {
        if (currentSection) {
          // Add the current section to the list
          sections.push(currentSection);
          currentSection = '';
        }
        // Add the empty part as its own section
        sections.push(part);
        continue;
      }
      
      // Determine the type of this part
      const isDialoguePart = part.trim().startsWith('"');
      const partType = isDialoguePart ? 'dialogue' : 'narrative';
      
      // If we're switching types or don't have a current section, start a new one
      if (!currentSection || currentType !== partType) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = part;
        currentType = partType;
      } else {
        // Same type, add to current section
        currentSection += part;
      }
    }
    
    // Add the last section if it's not empty
    if (currentSection) {
      sections.push(currentSection);
    }
    
    return sections;
  };
  
  // Helper function to check if a section is dialogue
  const isDialogueSection = (section: string): boolean => {
    // Check if the first non-whitespace character is a quote
    const trimmed = section.trim();
    return trimmed.length > 0 && trimmed[0] === '"';
  };
  
  // Helper function to process narration with the fine-tune model
  const processTwoPassNarration = async (section: string): Promise<string> => {
    try {
      // Skip processing for empty or whitespace-only sections
      if (!section.trim()) {
        console.log('Skipping empty section');
        return section;
      }
      
      // Skip processing for dialogue sections
      if (isDialogueSection(section)) {
        console.log('Skipping dialogue section');
        return section;
      }
      
      console.log('Processing narrative section:');
      console.log('Original section (first 100 chars):', section.substring(0, 100) + '...');
      
      // Process with fine-tune model
      const rewrittenText = await storyService.rewriteInChunks(section);
      
      // Ensure we're returning something with the same basic structure
      if (!rewrittenText || rewrittenText.trim().length === 0) {
        console.warn('Rewrite returned empty text, using original section');
        return section;
      }
      
      // Log the changes
      console.log('Rewritten section (first 100 chars):', rewrittenText.substring(0, 100) + '...');
      console.log('Section changed:', rewrittenText !== section);
      
      // If the text didn't change at all, that's suspicious
      if (rewrittenText === section) {
        console.warn('Warning: Section was not modified by the model at all');
      }
      
      return rewrittenText;
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
  const streamOutput = async (text: string, clientId?: string): Promise<void> => {
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
      let lastTimestamp = performance.now();
      
      // Use requestAnimationFrame with time-based updates instead of setInterval
      // This approach is more reliable when the tab is inactive
      const processWords = (timestamp: number) => {
        // Check if this is still the current client ID (if provided)
        if (clientId && clientId !== currentClientIdRef.current) {
          console.log('Client ID mismatch in streamOutput, aborting');
          resolve();
          return;
        }
        
        // Calculate how many words to process based on elapsed time
        const elapsed = timestamp - lastTimestamp;
        const wordsToProcess = Math.floor(elapsed / 100); // 10 words per second = 100ms per word
        
        if (wordsToProcess > 0) {
          lastTimestamp = timestamp;
          
          // Process multiple words if needed to catch up
          for (let i = 0; i < wordsToProcess && wordIndex < words.length; i++) {
            // Add the next word to the displayed text
            const word = words[wordIndex];
            displayedText += word;
            
            // Only count non-space words for the 10 words per second rate
            if (!/^\s+$/.test(word)) {
              nonSpaceWordCount++;
              // Save periodically (every 20 actual words)
              if (nonSpaceWordCount % 20 === 0) {
                onSave(displayedText);
              }
            }
            
            wordIndex++;
          }
          
          setContent(displayedText);
        }
        
        // Continue processing or resolve if done
        if (wordIndex < words.length) {
          // Check again if this is still the current client ID
          if (clientId && clientId !== currentClientIdRef.current) {
            console.log('Client ID mismatch in streamOutput loop, aborting');
            resolve();
            return;
          }
          
          // Use setTimeout with 0 delay as a fallback when tab is inactive
          // This prevents the browser from throttling the animation
          if (document.hidden) {
            setTimeout(() => processWords(performance.now()), 0);
          } else {
            requestAnimationFrame(processWords);
          }
        } else {
          // Ensure the final text is exactly what was processed
          setContent(text);
          onSave(text);
          resolve();
        }
      };
      
      // Start the animation loop
      requestAnimationFrame(processWords);
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
