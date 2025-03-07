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

interface SequelGenerationModalProps {
  open: boolean;
  originalStory: Story | null;
  onClose: () => void;
  onComplete: (sequelId: string) => void;
}

const STEPS = [
  "Generating sequel idea...",
  "Creating title...",
  "Building plot outline...",
  "Developing characters...",
  "Creating series...",
  "Saving sequel..."
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

  const progress = (currentStep / STEPS.length) * 100;

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
          <DialogContentWithoutCloseButton 
            className="max-w-2xl"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">Creating Sequel</DialogTitle>
                <DialogDescription className="text-base mt-1 text-gray-700 dark:text-gray-300">
                  {originalStory ? (
                    <>Creating a sequel to "{originalStory.title}". Please wait while we generate your sequel.</>
                  ) : (
                    <>Please wait while we generate your sequel.</>
                  )}
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-4">
                {error ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 mb-4 text-red-800 dark:text-red-300"
                  >
                    <div className="font-semibold mb-1">Error</div>
                    <div className="text-sm">{error}</div>
                  </motion.div>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key="sequel-generation-steps"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Progress value={progress} className="mb-4 bg-gray-200/50 dark:bg-gray-700/50" />
                      
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="space-y-2 p-4 bg-gray-100/50 dark:bg-gray-800/50 rounded-lg"
                      >
                        {STEPS.map((step, index) => (
                          <motion.div 
                            key={index} 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ 
                              opacity: 1, 
                              x: 0,
                              transition: { 
                                delay: index * 0.1,
                                duration: 0.3
                              }
                            }}
                            className="flex items-center gap-2"
                          >
                            {index < currentStep ? (
                              <div className="h-6 w-6 rounded-full bg-green-100 dark:bg-green-800/50 flex items-center justify-center">
                                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                              </div>
                            ) : index === currentStep ? (
                              <div className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                <Loader2 className="h-4 w-4 text-gray-700 dark:text-gray-300 animate-spin" />
                              </div>
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <div className="h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500"></div>
                              </div>
                            )}
                            <span className={`text-sm ${index === currentStep ? 'font-medium text-gray-800 dark:text-gray-200' : 'text-muted-foreground'}`}>
                              {step}
                            </span>
                          </motion.div>
                        ))}
                      </motion.div>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
              
              <div className="flex justify-center mt-4">
                <Button 
                  variant="outline" 
                  onClick={handleClose}
                  className="gap-2 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <X className="h-4 w-4" />
                  Cancel Sequel Generation
                </Button>
              </div>
            </motion.div>
          </DialogContentWithoutCloseButton>
        </Dialog>
      )}
    </AnimatePresence>
  );
} 