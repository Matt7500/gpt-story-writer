import { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContentWithoutCloseButton,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, Check, X, RefreshCw, Edit } from "lucide-react";
import { useStoryService } from "@/hooks/use-story-service";
import { useSeriesService } from "@/hooks/use-series-service";
import { Button } from "./ui/button";
import { useToast } from "@/hooks/use-toast";
import { Story } from "@/types/story";
import { supabase } from "@/integrations/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { ScrollArea } from "./ui/scroll-area";

interface SequelGenerationModalProps {
  open: boolean;
  originalStory: Story | null;
  onClose: () => void;
  onComplete: (sequelId: string) => void;
}

const STEPS = [
  {
    id: "idea",
    title: "Generating sequel idea",
    description: "Creating a continuation of your story"
  },
  {
    id: "title",
    title: "Creating title",
    description: "Crafting the perfect title for your sequel"
  },
  {
    id: "outline",
    title: "Building plot outline",
    description: "Developing the structure and key scenes"
  },
  {
    id: "characters",
    title: "Developing characters",
    description: "Creating and evolving characters for your sequel"
  },
  {
    id: "series",
    title: "Creating series",
    description: "Organizing your stories into a series"
  },
  {
    id: "saving",
    title: "Saving sequel",
    description: "Finalizing and saving your new sequel"
  }
];

export function SequelGenerationModal({ 
  open, 
  originalStory, 
  onClose, 
  onComplete 
}: SequelGenerationModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [proposedTitle, setProposedTitle] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [sequelIdea, setSequelIdea] = useState<string | null>(null);
  const [isSequelIdeaOpen, setIsSequelIdeaOpen] = useState(false);
  const [storyData, setStoryData] = useState<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const storyService = useStoryService();
  const seriesService = useSeriesService();
  const { toast } = useToast();

  // Create a new AbortController when the modal opens
  useEffect(() => {
    let isActive = true; // Flag to track if this effect is still active
    
    if (open) {
      // Reset all state
      setCurrentStep(0);
      setError(null);
      setIsCancelling(false);
      setProposedTitle(null);
      setIsEditingTitle(false);
      setCustomTitle("");
      setSequelIdea(null);
      setStoryData(null);
      setIsSequelIdeaOpen(false);
      
      // Create a new AbortController
      abortControllerRef.current = new AbortController();

      const generateSequel = async () => {
        if (!originalStory) return;
        
        try {
          // Check if cancelled before each step
          if (isCancelling || !isActive || !abortControllerRef.current) return;
          
          // Step 1: Generate sequel idea
          setCurrentStep(0);
          const sequelIdea = await storyService.generateSequelIdea(
            originalStory,
            abortControllerRef.current?.signal
          );
          
          // Check if cancelled after the operation
          if (isCancelling || !isActive || !abortControllerRef.current) return;
          
          setSequelIdea(sequelIdea);

          // Step 2: Generate title
          setCurrentStep(1);
          const title = await storyService.createTitle(
            sequelIdea,
            abortControllerRef.current?.signal
          );
          
          // Check if cancelled after the operation
          if (isCancelling || !isActive || !abortControllerRef.current) return;
          
          setProposedTitle(title);
          setCustomTitle(title);
          
          // Wait for user approval of the title
          // The rest of the process will continue in handleTitleApproval
          setStoryData({
            title,
            story_idea: sequelIdea,
            is_sequel: true,
            parent_story_id: originalStory.id
          });
          
          // Don't proceed to the next steps automatically
          // The user needs to approve the title first
          return;

          // The code below will be executed after title approval
          // in the handleTitleApproval function
        } catch (err: any) {
          // Only set error if we're not cancelling and the effect is still active
          if (err.name === 'AbortError' || isCancelling || !isActive) {
            console.log('Sequel generation aborted');
          } else {
            console.error('Sequel generation error:', err);
            if (isActive) {
              setError(err.message || 'An error occurred while generating the sequel');
            }
          }
        }
      };

      generateSequel();
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
  }, [open, originalStory, storyService, seriesService, isCancelling, onComplete]);

  const handleTitleApproval = async (approved: boolean) => {
    console.log('handleTitleApproval called with approved:', approved);
    console.log('Current state:', { storyData, sequelIdea, isCancelling, abortControllerRef: !!abortControllerRef.current });
    
    if (!storyData || !sequelIdea || isCancelling || !abortControllerRef.current) {
      console.log('Early return from handleTitleApproval due to missing data or cancellation');
      return;
    }

    try {
      if (!approved) {
        console.log('Generating new title');
        // Generate a new title
        setProposedTitle(null);
        const newTitle = await storyService.createTitle(
          sequelIdea,
          abortControllerRef.current?.signal
        );
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        console.log('Setting new title:', newTitle);
        setProposedTitle(newTitle);
        setCustomTitle(newTitle);
        
        // Update story data with new title
        setStoryData({
          ...storyData,
          title: newTitle
        });
        return;
      }
      
      console.log('Title approved, continuing with sequel generation');
      // Continue with the story generation process
      try {
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        // Use the current title (either the proposed one or the custom one)
        const finalTitle = isEditingTitle ? customTitle : storyData.title;
        console.log('Using final title:', finalTitle);
        
        // Update story data with the final title
        setStoryData({
          ...storyData,
          title: finalTitle
        });
        
        // Reset proposedTitle to switch back to the progress steps view
        setProposedTitle(null);
        
        // Step 3: Generate plot outline
        setCurrentStep(2);
        const plotOutline = await storyService.createOutline(
          sequelIdea,
          abortControllerRef.current?.signal
        );
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;

        // Step 4: Generate characters
        setCurrentStep(3);
        const characters = await storyService.generateCharacters(
          plotOutline || [],
          abortControllerRef.current?.signal
        );
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;

        // Step 5: Check if we need to create a series
        setCurrentStep(4);
        let seriesId = null;

        // Check if the original story is already part of a series
        const existingSeries = await seriesService.getSeriesForStory(originalStory.id);
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        if (existingSeries) {
          // Use the existing series
          seriesId = existingSeries.id;
          console.log(`Adding sequel to existing series: ${existingSeries.title} (${seriesId})`);
        } else {
          // Create a new series for the original story and its sequel
          const seriesTitle = `${originalStory.title} Series`;
          const seriesDescription = `A series starting with "${originalStory.title}" and its sequels.`;
          
          const series = await seriesService.createSeries(seriesTitle, seriesDescription);
          seriesId = series.id;
          console.log(`Created new series: ${seriesTitle} (${seriesId})`);
          
          // Add the original story to the series
          await seriesService.addStoryToSeries(seriesId, originalStory.id, 0);
        }
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;

        // Step 6: Save the sequel
        setCurrentStep(5);
        const sequelData = {
          title: finalTitle,
          story_idea: sequelIdea,
          plot_outline: plotOutline ? JSON.stringify(plotOutline) : '',
          characters: characters || '',
          is_sequel: true,
          parent_story_id: originalStory.id
        };

        const sequelId = await storyService.saveStory(sequelData);
        
        // Check if we're cancelling
        if (isCancelling || !abortControllerRef.current) return;
        
        // If we have a series, add the sequel to it
        if (seriesId) {
          await seriesService.addStoryToSeries(seriesId, sequelId);
        }
        
        // Check if we're cancelling one last time
        if (isCancelling || !abortControllerRef.current) return;

        // Complete the process
        safelyCompleteProcess(sequelId);
      } catch (error: any) {
        // Only set error if we're not cancelling
        if (error.name === 'AbortError' || isCancelling || !abortControllerRef.current) {
          console.log('Process aborted after title approval');
        } else {
          console.error('Error after title approval:', error);
          setError(error.message || 'An error occurred while generating the sequel');
          toast({
            title: "Error",
            description: error.message || 'An error occurred while generating the sequel',
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

  const handleClose = () => {
    console.log('Cancelling sequel generation process');
    
    // Set cancelling flag to true
    setIsCancelling(true);
    
    // Abort any in-progress requests
    if (abortControllerRef.current) {
      console.log('Aborting in-progress requests');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Reset state
    setCurrentStep(0);
    setError(null);
    setProposedTitle(null);
    setIsEditingTitle(false);
    setCustomTitle("");
    setSequelIdea(null);
    setStoryData(null);
    setIsSequelIdeaOpen(false);
    
    // Notify parent component
    onClose();
    
    // Show toast to confirm cancellation
    toast({
      title: "Sequel generation cancelled",
      description: "The sequel generation process has been cancelled.",
      duration: 3000,
    });
  };

  // Safe wrapper around onComplete to prevent race conditions
  const safelyCompleteProcess = (sequelId: string) => {
    // Cleanup first to prevent any pending operations
    if (abortControllerRef.current) {
      abortControllerRef.current = null;
    }
    
    // Make sure we're not in a cancelling state
    if (!isCancelling) {
      console.log('Safely completing process with sequelId:', sequelId);
      
      // Reset all state before calling onComplete
      setCurrentStep(0);
      setError(null);
      setProposedTitle(null);
      setIsEditingTitle(false);
      setCustomTitle("");
      setSequelIdea(null);
      setStoryData(null);
      setIsSequelIdeaOpen(false);
      
      // Show a success message
      toast({
        title: "Sequel Created",
        description: "Your sequel has been created successfully. Loading editor...",
        duration: 5000,
      });
      
      // Call onComplete after a longer delay to ensure the sequel is fully saved
      // and available in the database before the Editor component tries to load it
      setTimeout(() => {
        console.log('Delay complete, now calling onComplete with sequelId:', sequelId);
        onComplete(sequelId);
      }, 1500); // Longer 1.5 second delay to ensure database consistency
    } else {
      console.log('Not completing process because cancellation is in progress');
    }
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
                <DialogTitle className="text-xl font-bold">Sequel Creation</DialogTitle>
                <DialogDescription className="text-base mt-1">
                  {originalStory ? (
                    <>Creating a sequel to "{originalStory.title}"</>
                  ) : (
                    <>Creating your new sequel</>
                  )}
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
                  <AnimatePresence mode="wait">
                    <motion.div 
                      key="title-approval-section"
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
                                <p className="text-xs text-muted-foreground">Enter a custom title for your sequel</p>
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
                      
                      {/* Sequel idea preview - Enhanced scrollability */}
                      {sequelIdea && (
                        <Collapsible 
                          open={isSequelIdeaOpen} 
                          onOpenChange={setIsSequelIdeaOpen}
                          className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800/50"
                        >
                          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 text-left">
                            <div className="font-medium">Sequel Idea Preview</div>
                            <div className="text-muted-foreground">
                              <motion.div
                                animate={{ rotate: isSequelIdeaOpen ? 180 : 0 }}
                                transition={{ duration: 0.2, ease: "easeInOut" }}
                              >
                                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                                  <path d="M3.13523 6.15803C3.3241 5.95657 3.64052 5.94637 3.84197 6.13523L7.5 9.56464L11.158 6.13523C11.3595 5.94637 11.6759 5.95657 11.8648 6.15803C12.0536 6.35949 12.0434 6.67591 11.842 6.86477L7.84197 10.6148C7.64964 10.7951 7.35036 10.7951 7.15803 10.6148L3.15803 6.86477C2.95657 6.67591 2.94637 6.35949 3.13523 6.15803Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                                </svg>
                              </motion.div>
                            </div>
                          </CollapsibleTrigger>
                          <AnimatePresence initial={false}>
                            {isSequelIdeaOpen && (
                              <CollapsibleContent forceMount className="overflow-hidden" asChild>
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.3, ease: "easeInOut" }}
                                >
                                  <div className="p-4">
                                    <ScrollArea className="max-h-[200px] overflow-auto bg-white/30 dark:bg-gray-700/30 rounded">
                                      <div className="p-3 pr-6">
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{sequelIdea}</p>
                                      </div>
                                    </ScrollArea>
                                  </div>
                                </motion.div>
                              </CollapsibleContent>
                            )}
                          </AnimatePresence>
                        </Collapsible>
                      )}
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <AnimatePresence mode="wait">
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
                              <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
              
              {/* Footer */}
              <div className="pt-4 flex justify-between">
                <Button 
                  variant="destructive" 
                  onClick={handleClose}
                  className="flex items-center"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <div></div> {/* Empty div to maintain the justify-between spacing */}
              </div>
            </motion.div>
          </DialogContentWithoutCloseButton>
        </Dialog>
      )}
    </AnimatePresence>
  );
} 