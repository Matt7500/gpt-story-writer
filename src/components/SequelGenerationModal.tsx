import { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContentWithoutCloseButton,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, Check, X } from "lucide-react";
import { useStoryService } from "@/hooks/use-story-service";
import { useSeriesService } from "@/hooks/use-series-service";
import { Button } from "./ui/button";
import { useToast } from "@/hooks/use-toast";
import { Story } from "@/types/story";
import { supabase } from "@/integrations/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

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
  const abortControllerRef = useRef<AbortController | null>(null);
  const storyService = useStoryService();
  const seriesService = useSeriesService();
  const { toast } = useToast();

  // Create a new AbortController when the modal opens
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setError(null);
      setIsCancelling(false);
      abortControllerRef.current = new AbortController();

      const generateSequel = async () => {
        if (!originalStory || isCancelling) return;

        try {
          // Step 1: Generate sequel idea
          setCurrentStep(0);
          const sequelIdea = await storyService.generateSequelIdea(
            originalStory,
            abortControllerRef.current?.signal
          );
          if (isCancelling) return;

          // Step 2: Generate title
          setCurrentStep(1);
          const title = await storyService.createTitle(
            sequelIdea,
            abortControllerRef.current?.signal
          );
          if (isCancelling) return;

          // Step 3: Generate plot outline
          setCurrentStep(2);
          const plotOutline = await storyService.createOutline(
            sequelIdea,
            abortControllerRef.current?.signal
          );
          if (isCancelling) return;

          // Step 4: Generate characters
          setCurrentStep(3);
          const characters = await storyService.generateCharacters(
            plotOutline || [],
            abortControllerRef.current?.signal
          );
          if (isCancelling) return;

          // Step 5: Check if we need to create a series
          setCurrentStep(4);
          let seriesId = null;

          // Check if the original story is already part of a series
          const existingSeries = await seriesService.getSeriesForStory(originalStory.id);
          
          if (existingSeries) {
            // Use the existing series
            seriesId = existingSeries.id;
            console.log(`Adding sequel to existing series: ${existingSeries.title} (${seriesId})`);
          } else if (originalStory.is_sequel || originalStory.parent_story_id) {
            // This is a sequel to a sequel, so we should create a series
            // First, find the original parent story (the first in the chain)
            let rootStory = originalStory;
            let parentId = rootStory.parent_story_id;
            
            while (parentId) {
              const { data, error } = await supabase
                .from('stories')
                .select('*')
                .eq('id', parentId)
                .single();
                
              if (error || !data) break;
              
              rootStory = data as unknown as Story;
              parentId = rootStory.parent_story_id;
            }
            
            // Create a series with the root story and all sequels
            const seriesTitle = `${rootStory.title} Series`;
            const seriesDescription = `A series starting with "${rootStory.title}" and its sequels.`;
            
            const series = await seriesService.createSeries(seriesTitle, seriesDescription);
            seriesId = series.id;
            console.log(`Created new series: ${seriesTitle} (${seriesId})`);
            
            // Add the root story to the series
            await seriesService.addStoryToSeries(seriesId, rootStory.id, 0);
            
            // Add any intermediate stories to the series
            if (rootStory.id !== originalStory.id) {
              await seriesService.addStoryToSeries(seriesId, originalStory.id, 1);
            }
          }

          // Step 6: Save the sequel
          setCurrentStep(5);
          const sequelData = {
            title,
            story_idea: sequelIdea,
            plot_outline: plotOutline ? JSON.stringify(plotOutline) : '',
            characters: characters || '',
            is_sequel: true,
            parent_story_id: originalStory.id
          };

          const sequelId = await storyService.saveStory(sequelData);
          
          // If we have a series, add the sequel to it
          if (seriesId) {
            await seriesService.addStoryToSeries(seriesId, sequelId);
          }

          // Complete the process
          onComplete(sequelId);
          
        } catch (err: any) {
          if (err.name === 'AbortError') {
            console.log('Sequel generation aborted');
          } else {
            console.error('Sequel generation error:', err);
            setError(err.message || 'An error occurred while generating the sequel');
          }
        }
      };

      generateSequel();
    }
  }, [open, originalStory, storyService, seriesService, isCancelling, onComplete]);

  const handleClose = () => {
    // Set cancelling flag to true
    setIsCancelling(true);
    
    // Abort any in-progress requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Reset state
    setCurrentStep(0);
    setError(null);
    
    // Notify parent component
    onClose();
    
    // Show toast to confirm cancellation
    toast({
      title: "Sequel generation cancelled",
      description: "The sequel generation process has been cancelled.",
      duration: 3000,
    });
  };

  // Calculate progress percentage
  const progress = (currentStep / STEPS.length) * 100;

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
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {step.description}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
              
              {/* Footer */}
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
            </motion.div>
          </DialogContentWithoutCloseButton>
        </Dialog>
      )}
    </AnimatePresence>
  );
} 