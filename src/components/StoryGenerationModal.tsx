import { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContentWithoutCloseButton,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, Check, RefreshCw, Edit, ChevronDown, ChevronUp, X } from "lucide-react";
import { useStoryService } from "@/hooks/use-story-service";
import { Button } from "./ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "./ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface StoryGenerationModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (storyId: string) => void;
}

const STEPS = [
  {
    id: "idea",
    title: "Generating story idea",
    description: "Creating a unique and engaging story concept"
  },
  {
    id: "title",
    title: "Creating title",
    description: "Crafting the perfect title for your story"
  },
  {
    id: "outline",
    title: "Building plot outline",
    description: "Developing the structure and key scenes"
  },
  {
    id: "characters",
    title: "Developing characters",
    description: "Creating memorable characters for your story"
  },
  {
    id: "saving",
    title: "Saving story",
    description: "Finalizing and saving your new story"
  }
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
          const idea = await storyService.generateStoryIdea(
            abortControllerRef.current?.signal
          );
          
          // Check if we're cancelling after story idea generation
          if (isCancelling || !abortControllerRef.current) return;
          
          setStoryIdea(idea);
          
          // Step 2: Create title from story idea
          setCurrentStep(1);
          const title = await storyService.createTitle(
            idea,
            abortControllerRef.current?.signal
          );
          
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
        const newTitle = await storyService.createTitle(
          storyIdea,
          abortControllerRef.current?.signal
        );
        
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
        const outline = await storyService.createOutline(
          storyIdea,
          abortControllerRef.current?.signal
        );
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        if (!outline) {
          throw new Error('Failed to create outline');
        }
        
        // Step 4: Develop characters
        setCurrentStep(3);
        const characters = await storyService.generateCharacters(
          outline,
          abortControllerRef.current?.signal
        );
        
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
          variant: "destructive",
          duration: 3000,
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

  // Calculate progress percentage
  const progress = proposedTitle 
    ? (currentStep / STEPS.length) * 100 
    : Math.min(20, (currentStep / STEPS.length) * 100);

  // Get current step info
  const currentStepInfo = STEPS[currentStep];

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { 
        duration: 0.2, 
        ease: "easeOut" 
      }
    },
    exit: { 
      opacity: 0, 
      scale: 0.95,
      transition: { 
        duration: 0.2, 
        ease: "easeIn" 
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <Dialog 
          open={open} 
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              handleClose();
            }
          }}
        >
          <DialogContentWithoutCloseButton className="max-w-2xl">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex flex-col"
            >
              {/* Header */}
              <DialogHeader className="pb-4">
                <DialogTitle className="text-xl font-bold">Story Creation</DialogTitle>
                <DialogDescription className="text-base mt-1">
                  {proposedTitle 
                    ? `Creating "${proposedTitle}"` 
                    : "Creating your new story"}
                </DialogDescription>
              </DialogHeader>
              
              {/* Main content */}
              <div className="py-4">
                {error ? (
                  <div className="bg-red-50 rounded-lg p-4 mb-4 text-red-800">
                    <div className="font-semibold mb-1">Error</div>
                    <div className="text-sm">{error}</div>
                  </div>
                ) : proposedTitle ? (
                  <div className="space-y-6">
                    {/* Title approval section */}
                    <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-blue-800 dark:text-blue-300">Proposed Title</h3>
                        {!isEditingTitle && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={toggleEditTitle}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 h-7 px-2"
                          >
                            <Edit className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                        )}
                      </div>
                      
                      {isEditingTitle ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Input 
                              value={customTitle} 
                              onChange={handleCustomTitleChange} 
                              className="focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 flex-1"
                              placeholder="Enter your custom title"
                              autoFocus
                            />
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={toggleEditTitle}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              Cancel
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">Enter a custom title for your story</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-lg font-semibold">{proposedTitle}</p>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-4 pt-3">
                        <Button 
                          variant="outline" 
                          onClick={() => handleTitleApproval(false)}
                          className="text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Generate New Title
                        </Button>
                        <Button 
                          onClick={() => handleTitleApproval(true)}
                          className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Use This Title
                        </Button>
                      </div>
                    </div>
                    
                    {/* Story idea preview */}
                    <Collapsible 
                      open={isStoryIdeaOpen} 
                      onOpenChange={setIsStoryIdeaOpen}
                      className="rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-900/30"
                    >
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 text-left">
                        <div className="font-medium">Story Idea Preview</div>
                        <div className="text-muted-foreground">
                          <motion.div
                            animate={{ rotate: isStoryIdeaOpen ? 180 : 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </motion.div>
                        </div>
                      </CollapsibleTrigger>
                      <AnimatePresence initial={false}>
                        {isStoryIdeaOpen && (
                          <CollapsibleContent forceMount className="overflow-hidden" asChild>
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                            >
                              <div className="px-4 pb-4">
                                <div className="bg-white/50 dark:bg-slate-800/50 p-3 rounded text-sm text-muted-foreground max-h-[200px] overflow-y-auto">
                                  {storyIdea}
                                </div>
                              </div>
                            </motion.div>
                          </CollapsibleContent>
                        )}
                      </AnimatePresence>
                    </Collapsible>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Steps visualization */}
                    <div className="space-y-3">
                      {STEPS.map((step, index) => (
                        <div
                          key={step.id}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg transition-all",
                            index === currentStep 
                              ? "bg-blue-50/40 dark:bg-blue-900/20" 
                              : "bg-transparent",
                            index < currentStep 
                              ? "opacity-70" 
                              : index === currentStep 
                                ? "opacity-100" 
                                : "opacity-50"
                          )}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {index === currentStep ? (
                              <div className="h-5 w-5 rounded-full bg-blue-100/70 dark:bg-blue-800/50 flex items-center justify-center">
                                <Loader2 className="h-3 w-3 text-blue-600 dark:text-blue-400 animate-spin" />
                              </div>
                            ) : index < currentStep ? (
                              <div className="h-5 w-5 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                                <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                              </div>
                            ) : (
                              <div className="h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <div className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className={cn(
                              "font-medium text-sm",
                              index === currentStep ? "text-foreground" : 
                              index < currentStep ? "text-muted-foreground" : 
                              "text-muted-foreground"
                            )}>
                              {step.title}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {step.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Footer */}
              {!proposedTitle && (
                <div className="pt-2 flex justify-start">
                  <Button 
                    variant="destructive"
                    onClick={handleClose}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </motion.div>
          </DialogContentWithoutCloseButton>
        </Dialog>
      )}
    </AnimatePresence>
  );
} 