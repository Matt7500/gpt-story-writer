import { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContentWithoutCloseButton,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, Check, RefreshCw, Edit, ChevronDown, ChevronUp, X } from "lucide-react";
import { useStoryService } from "@/hooks/use-story-service";
import { Button } from "./ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { AnimatePresence, motion } from "framer-motion";

interface StoryGenerationModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (storyId: string) => void;
}

const STEPS = [
  "Generating story idea...",
  "Creating title...",
  "Building plot outline...",
  "Developing characters...",
  "Saving story..."
];

export function StoryGenerationModal({ open, onClose, onComplete }: StoryGenerationModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [proposedTitle, setProposedTitle] = useState<string | null>(null);
  const [storyData, setStoryData] = useState<any>(null);
  const [storyIdea, setStoryIdea] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [isStoryIdeaOpen, setIsStoryIdeaOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const storyService = useStoryService();
  const { toast } = useToast();

  // Create a new AbortController when the modal opens
  useEffect(() => {
    if (open) {
      abortControllerRef.current = new AbortController();
      setIsCancelling(false);
    } else {
      // Clean up when modal closes
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }

    return () => {
      // Clean up on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [open]);

  useEffect(() => {
    if (open && !isCancelling) {
      setCurrentStep(0);
      setError(null);
      setProposedTitle(null);
      setStoryData(null);
      setStoryIdea(null);
      setIsEditingTitle(false);
      setCustomTitle("");
      setIsStoryIdeaOpen(false);

      const generateStoryIdea = async () => {
        try {
          // Check if we're cancelling
          if (isCancelling || !abortControllerRef.current) return;

          // Step 1: Generate story idea
          setCurrentStep(0);
          const idea = await storyService.generateStoryIdea();
          
          // Check if we're cancelling after story idea generation
          if (isCancelling || !abortControllerRef.current) return;
          
          setStoryIdea(idea);
          
          // Step 2: Create title from story idea
          setCurrentStep(1);
          const title = await storyService.createTitle(idea);
          
          // Check if we're cancelling after title generation
          if (isCancelling || !abortControllerRef.current) return;
          
          setProposedTitle(title);
          setCustomTitle(title);
          
          // Store partial story data
          setStoryData({
            title,
            story_idea: idea
          });
          
          // Wait for title approval before continuing
        } catch (err: any) {
          // Only show error if we're not cancelling
          if (!isCancelling) {
            console.error('Story generation error:', err);
            setError(err.message || 'An error occurred while generating the story idea');
          }
        }
      };

      generateStoryIdea();
    }
  }, [open, storyService, isCancelling]);

  const handleClose = () => {
    // Set cancelling flag to true
    setIsCancelling(true);
    
    // Abort any in-progress requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Reset all state
    setCurrentStep(0);
    setError(null);
    setProposedTitle(null);
    setStoryData(null);
    setStoryIdea(null);
    setIsEditingTitle(false);
    setCustomTitle("");
    setIsStoryIdeaOpen(false);
    
    // Notify parent component
    onClose();
    
    // Show toast to confirm cancellation
    toast({
      title: "Story generation cancelled",
      description: "The story generation process has been cancelled.",
      duration: 3000,
    });
  };

  const handleTitleApproval = async (approved: boolean) => {
    if (!storyData || !storyIdea || isCancelling) return;

    try {
      if (!approved) {
        // Generate a new title
        setProposedTitle(null);
        const newTitle = await storyService.createTitle(storyIdea);
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        setProposedTitle(newTitle);
        setCustomTitle(newTitle);
        
        // Update story data with new title
        setStoryData({
          ...storyData,
          title: newTitle
        });
        return;
      }
      
      // Continue with the story generation process
      try {
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        // Use custom title if editing, otherwise use proposed title
        const finalTitle = isEditingTitle ? customTitle : proposedTitle;
        
        // Update story data with the final title
        setStoryData({
          ...storyData,
          title: finalTitle
        });
        
        // Step 3: Build plot outline
        setCurrentStep(2);
        const outline = await storyService.createOutline(storyIdea);
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        if (!outline) {
          throw new Error('Failed to create outline');
        }
        
        // Step 4: Develop characters
        setCurrentStep(3);
        const characters = await storyService.generateCharacters(outline);
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        if (!characters) {
          throw new Error('Failed to generate characters');
        }
        
        // Update story data with outline and characters
        const updatedStoryData = {
          ...storyData,
          title: finalTitle,
          plot_outline: JSON.stringify(outline),
          characters,
          chapters: outline.map((sceneBeat, index) => ({
            title: `Chapter ${index + 1}`,
            content: '',
            completed: false,
            sceneBeat
          }))
        };
        
        // Step 5: Save story
        setCurrentStep(4);
        const storyId = await storyService.saveStory(updatedStoryData);
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        // Complete the process
        onComplete(storyId);
      } catch (err: any) {
        // Only show error if we're not cancelling
        if (!isCancelling) {
          console.error('Story generation error:', err);
          setError(err.message || 'An error occurred while generating the story');
        }
      }
    } catch (error: any) {
      // Only show error if we're not cancelling
      if (!isCancelling) {
        console.error('Title approval error:', error);
        setError(error.message || 'An error occurred while processing title approval');
        toast({
          title: "Error",
          description: error.message || 'An error occurred while processing title approval',
          variant: "destructive"
        });
      }
    }
  };

  const toggleEditTitle = () => {
    setIsEditingTitle(!isEditingTitle);
  };

  const handleCustomTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomTitle(e.target.value);
  };

  const progress = (currentStep / STEPS.length) * 100;

  // Animation variants for the title approval section
  const titleApprovalVariants = {
    hidden: { 
      opacity: 0, 
      height: 0,
      marginTop: 0,
      transition: { 
        duration: 0.2,
        ease: "easeInOut"
      }
    },
    visible: { 
      opacity: 1, 
      height: "auto",
      marginTop: 24,
      transition: { 
        duration: 0.2,
        ease: "easeInOut"
      }
    }
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleClose();
        }
      }}
    >
      <DialogContentWithoutCloseButton className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generating Your Story</DialogTitle>
          <DialogDescription>
            Please wait while we create your story. This may take a few moments.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {error ? (
            <div className="text-red-500 mb-4">
              {error}
            </div>
          ) : (
            <>
              <Progress value={progress} className="mb-4" />
              
              <div className="space-y-4">
                {STEPS.map((step, index) => (
                  <div
                    key={step}
                    className="flex items-center gap-3"
                  >
                    {index === currentStep ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : index < currentStep ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border" />
                    )}
                    <span className={index <= currentStep ? "text-foreground" : "text-muted-foreground"}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>

              {/* Title Approval UI with Animation */}
              <AnimatePresence>
                {proposedTitle && currentStep === 1 && (
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={titleApprovalVariants}
                    className="space-y-4 overflow-hidden"
                  >
                    {/* Story Idea Collapsible */}
                    {storyIdea && (
                      <Collapsible
                        open={isStoryIdeaOpen}
                        onOpenChange={setIsStoryIdeaOpen}
                        className="bg-muted/50 rounded-lg shadow-sm"
                      >
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="flex w-full justify-between p-4">
                            <span className="font-medium">View Story Idea</span>
                            {isStoryIdeaOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-4 pb-4">
                          <Textarea 
                            value={storyIdea} 
                            readOnly 
                            className="w-full h-40 resize-none bg-background/80"
                          />
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    
                    {/* Title Section */}
                    <div className="bg-muted/50 rounded-lg p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold">
                          {isEditingTitle ? "Edit Title:" : "Proposed Title:"}
                        </h3>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={toggleEditTitle}
                        >
                          {isEditingTitle ? (
                            <>Cancel Editing</>
                          ) : (
                            <>
                              <Edit className="h-4 w-4 mr-2" />
                              Create Custom Title
                            </>
                          )}
                        </Button>
                      </div>
                      
                      {isEditingTitle ? (
                        <Input
                          value={customTitle}
                          onChange={handleCustomTitleChange}
                          placeholder="Enter your custom title"
                          className="mb-4 bg-background/80"
                        />
                      ) : (
                        <p className="text-xl mb-4 px-3 py-2 bg-background/80 rounded-md">{proposedTitle}</p>
                      )}
                      
                      <div className="flex gap-2">
                        <Button 
                          variant="default" 
                          onClick={() => handleTitleApproval(true)}
                        >
                          <Check className="h-4 w-4 mr-2" />
                          {isEditingTitle ? "Use Custom Title" : "Accept Title"}
                        </Button>
                        {!isEditingTitle && (
                          <Button 
                            variant="outline" 
                            onClick={() => handleTitleApproval(false)}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Generate New Title
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
        
        <Button variant="destructive" onClick={handleClose} className="mt-2">
          <X className="h-4 w-4 mr-2" />
          Cancel Story Generation
        </Button>
      </DialogContentWithoutCloseButton>
    </Dialog>
  );
} 