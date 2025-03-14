import { useEffect, useState, useRef, useCallback } from "react";
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
  source?: 'reddit' | 'fine-tune' | 'custom';
  customIdea?: string;
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
    title: "Creating outline",
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

export function StoryGenerationModal({ open, onClose, onComplete, source = 'reddit', customIdea = '' }: StoryGenerationModalProps) {
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

  // Define the generateStoryIdea function using useCallback to avoid dependency issues
  const generateStoryIdea = useCallback(async () => {
    try {
      // Check if we're cancelling
      if (isCancelling || !abortControllerRef.current) return;

      if (source === 'custom' && customIdea) {
        // If we have a custom idea, use it directly
        setStoryIdea(customIdea);
        setCurrentStep(1); // Skip to the next step
        
        // Generate title from the custom idea
        const title = await storyService.createTitle(
          customIdea,
          abortControllerRef.current?.signal
        );
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        setProposedTitle(title);
        setCustomTitle(title);
        
        // Create initial story data
        setStoryData({
          title,
          story_idea: customIdea
        });
        
        return;
      }
      
      // For non-custom sources, we need to generate a story idea first
      setCurrentStep(0);
      
      let idea;
      if (source === 'fine-tune') {
        idea = await storyService.generateStoryIdea(
          abortControllerRef.current?.signal,
          'fine-tune'
        );
      } else {
        // Default to reddit source
        idea = await storyService.generateStoryIdea(
          abortControllerRef.current?.signal,
          'reddit'
        );
      }
      
      // Check if we're cancelling
      if (isCancelling || !abortControllerRef.current) return;
      
      setStoryIdea(idea);
      
      // Generate title from the idea
      setCurrentStep(1);
      const title = await storyService.createTitle(
        idea,
        abortControllerRef.current?.signal
      );
      
      // Check if we're cancelling
      if (isCancelling || !abortControllerRef.current) return;
      
      setProposedTitle(title);
      setCustomTitle(title);
      
      // Create initial story data
      setStoryData({
        title,
        story_idea: idea
      });
    } catch (error: any) {
      // Only set error if we're not cancelling
      if (error.name === 'AbortError' || isCancelling || !abortControllerRef.current) {
        console.log('Story idea generation aborted');
      } else {
        console.error('Error generating story idea:', error);
        setError(error.message || 'An error occurred while generating the story idea');
      }
    }
  }, [source, customIdea, storyService, isCancelling]);

  // Create a new AbortController when the modal opens
  useEffect(() => {
    let isActive = true; // Flag to track if this effect is still active
    
    if (open) {
      // Reset all state
      setCurrentStep(0);
      setError(null);
      setIsCancelling(false);
      setProposedTitle(null);
      setStoryData(null);
      setStoryIdea(null);
      setIsEditingTitle(false);
      setCustomTitle("");
      setIsStoryIdeaOpen(false);
      
      // Create a new AbortController
      abortControllerRef.current = new AbortController();
      
      // Start the story generation process
      generateStoryIdea();
    }
    
    // Cleanup function to handle component unmount or modal close
    return () => {
      isActive = false; // Mark this effect as inactive
      
      // If the modal is closing, ensure we clean up properly
      if (open) {
        // Abort any in-progress requests
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
      }
    };
  }, [open, generateStoryIdea]);

  const handleClose = () => {
    console.log('Cancelling story generation process');
    
    // Set cancelling flag to true
    setIsCancelling(true);
    
    // Abort any in-progress requests
    if (abortControllerRef.current) {
      console.log('Aborting in-progress requests');
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
    if (!storyData || !storyIdea || isCancelling || !abortControllerRef.current) return;

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
        
        // Use the current title (either the proposed one or the custom one)
        const finalTitle = isEditingTitle ? customTitle : storyData.title;
        
        // Update story data with the final title
        setStoryData({
          ...storyData,
          title: finalTitle
        });
        
        // Reset proposedTitle to switch back to the progress steps view
        setProposedTitle(null);
        
        // Generate plot outline
        setCurrentStep(2);
        const plotOutline = await storyService.createOutline(
          storyIdea,
          abortControllerRef.current?.signal
        );
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        // Generate characters
        setCurrentStep(3);
        const characters = await storyService.generateCharacters(
          plotOutline || [],
          abortControllerRef.current?.signal
        );
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        // Save the story
        setCurrentStep(4);
        const storyToSave = {
          title: finalTitle,
          story_idea: storyIdea,
          plot_outline: plotOutline ? JSON.stringify(plotOutline) : '',
          characters: characters || ''
        };
        
        const storyId = await storyService.saveStory(storyToSave);
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        // Complete the process
        onComplete(storyId);
      } catch (error: any) {
        // Only set error if we're not cancelling
        if (error.name === 'AbortError' || isCancelling || !abortControllerRef.current) {
          console.log('Process aborted after title approval');
        } else {
          console.error('Error after title approval:', error);
          setError(error.message || 'An error occurred while generating the story');
          toast({
            title: "Error",
            description: error.message || 'An error occurred while generating the story',
            variant: "destructive",
            duration: 3000,
          });
        }
      }
    } catch (error: any) {
      // Only set error if we're not cancelling
      if (error.name === 'AbortError' || isCancelling || !abortControllerRef.current) {
        console.log('Title approval process aborted');
      } else {
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
              console.log('Dialog closing, triggering handleClose');
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
                ) : (
                  <AnimatePresence mode="wait">
                    {proposedTitle ? (
                      <motion.div 
                        key="title-section"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-6"
                      >
                        {/* Title approval section */}
                        <AnimatePresence mode="wait">
                          <motion.div 
                            key="title-approval"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="bg-gray-100 dark:bg-gray-800/70 rounded-lg p-4"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="font-medium text-gray-800 dark:text-gray-200">Proposed Title</h3>
                              {!isEditingTitle && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={toggleEditTitle}
                                  className="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 h-7 px-2"
                                >
                                  <Edit className="h-3.5 w-3.5 mr-1" />
                                  Edit
                                </Button>
                              )}
                            </div>
                            
                            <AnimatePresence mode="wait">
                              {isEditingTitle ? (
                                <motion.div 
                                  key="edit-title"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="space-y-3"
                                >
                                  <div className="flex items-center gap-2">
                                    <Input 
                                      value={customTitle} 
                                      onChange={handleCustomTitleChange} 
                                      className="focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 flex-1"
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
                                </motion.div>
                              ) : (
                                <motion.div
                                  key="display-title"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <p className="text-lg font-semibold">{proposedTitle}</p>
                                </motion.div>
                              )}
                            </AnimatePresence>
                            
                            <div className="flex items-center justify-between mt-4 pt-3">
                              <Button 
                                variant="outline" 
                                onClick={() => handleTitleApproval(false)}
                                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Generate New Title
                              </Button>
                              <Button 
                                onClick={() => handleTitleApproval(true)}
                                className="bg-gray-800 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white"
                              >
                                <Check className="h-4 w-4 mr-2" />
                                Use This Title
                              </Button>
                            </div>
                          </motion.div>
                        </AnimatePresence>
                        
                        {/* Story idea preview */}
                        <Collapsible 
                          open={isStoryIdeaOpen} 
                          onOpenChange={setIsStoryIdeaOpen}
                          className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800/50"
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
                                    <div className="bg-white/50 dark:bg-gray-700/50 p-3 rounded text-sm text-muted-foreground max-h-[400px] overflow-y-auto">
                                      {storyIdea}
                                    </div>
                                  </div>
                                </motion.div>
                              </CollapsibleContent>
                            )}
                          </AnimatePresence>
                        </Collapsible>
                      </motion.div>
                    ) : (
                      <motion.div 
                        key="steps-section"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-6"
                      >
                        {/* Steps visualization */}
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          className="space-y-3"
                        >
                          {STEPS.map((step, index) => (
                            <motion.div
                              key={step.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ 
                                opacity: 1, 
                                x: 0,
                                transition: { 
                                  delay: index * 0.1,
                                  duration: 0.3
                                }
                              }}
                              className={cn(
                                "flex items-start gap-3 p-3 rounded-lg transition-all",
                                index === currentStep 
                                  ? "bg-gray-100 dark:bg-gray-800/70" 
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
                                  <div className="h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                    <Loader2 className="h-3 w-3 text-gray-700 dark:text-gray-300 animate-spin" />
                                  </div>
                                ) : index < currentStep ? (
                                  <div className="h-5 w-5 rounded-full bg-green-100 dark:bg-green-800/50 flex items-center justify-center">
                                    <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                                  </div>
                                ) : (
                                  <div className="h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-400" />
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
                            </motion.div>
                          ))}
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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