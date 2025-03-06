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
    if (open && originalStory && !isCancelling) {
      setCurrentStep(0);
      setError(null);
      
      console.log('Starting sequel generation process for story:', originalStory.title);

      const generateSequel = async () => {
        try {
          // Check if we're cancelling
          if (isCancelling || !abortControllerRef.current) return;

          // Step 1: Generate sequel idea
          console.log('Step 1: Generating sequel idea');
          setCurrentStep(0);
          const sequelIdea = await storyService.generateSequelIdea(originalStory);
          console.log('Generated sequel idea:', sequelIdea.substring(0, 100) + '...');
          
          // Check if we're cancelling
          if (isCancelling || !abortControllerRef.current) return;
          
          // Step 2: Create sequel title using the standard title generation function
          console.log('Step 2: Creating sequel title using standard title function');
          setCurrentStep(1);
          const sequelTitle = await storyService.createTitle(sequelIdea);
          console.log('Generated sequel title:', sequelTitle);
          
          // Check if we're cancelling
          if (isCancelling || !abortControllerRef.current) return;
          
          // Step 3: Create outline for the sequel
          console.log('Step 3: Creating outline');
          setCurrentStep(2);
          const outline = await storyService.createOutline(sequelIdea);
          console.log('Generated outline with', outline ? outline.length : 0, 'scenes');
          
          // Check if we're cancelling
          if (isCancelling || !abortControllerRef.current) return;
          
          if (!outline) {
            throw new Error('Failed to create outline for sequel');
          }
          
          // Step 4: Generate characters for the sequel
          console.log('Step 4: Generating characters');
          setCurrentStep(3);
          const characters = await storyService.generateCharacters(outline);
          console.log('Generated characters');
          
          // Check if we're cancelling
          if (isCancelling || !abortControllerRef.current) return;
          
          if (!characters) {
            throw new Error('Failed to generate characters for sequel');
          }
          
          // Step 5: Create or update series (if needed)
          console.log('Step 5: Creating or updating series');
          setCurrentStep(4);
          
          // Create the sequel story data
          const sequelData = {
            title: sequelTitle,
            story_idea: sequelIdea,
            plot_outline: JSON.stringify(outline),
            characters,
            parent_story_id: originalStory.id,
            is_sequel: true,
            chapters: outline.map((sceneBeat, index) => ({
              title: `Chapter ${index + 1}`,
              content: '',
              completed: false,
              sceneBeat
            }))
          };
          
          // Step 6: Save the sequel
          console.log('Step 6: Saving sequel');
          setCurrentStep(5);
          const sequelId = await storyService.saveStory(sequelData);
          console.log('Saved sequel with ID:', sequelId);
          
          // Check if we're cancelling
          if (isCancelling || !abortControllerRef.current) return;
          
          // Series handling logic
          console.log('Handling series relationships');
          
          // Check if the original story is part of a series
          const { data: seriesStoryData, error: seriesStoryError } = await supabase
            .from('series_stories')
            .select('series_id')
            .eq('story_id', originalStory.id);
            
          if (seriesStoryError) {
            console.error('Error checking if story is in a series:', seriesStoryError);
          }
          
          if (seriesStoryData && seriesStoryData.length > 0) {
            // The original story is already part of a series
            const seriesId = seriesStoryData[0].series_id;
            console.log('Original story is part of series:', seriesId);
            
            // Add the sequel to the existing series
            await seriesService.addStoryToSeries(seriesId, sequelId);
            console.log('Added sequel to existing series');
          } else {
            // The original story is not part of a series, create a new one
            console.log('Creating new series for original story and sequel');
            
            // Create a new series
            const seriesTitle = `The ${originalStory.title} Series`;
            const seriesDescription = `A series beginning with "${originalStory.title}" and continuing with "${sequelTitle}".`;
            
            // Create the series
            const series = await seriesService.createSeries(seriesTitle, seriesDescription);
            console.log('Created new series with ID:', series.id);
            
            // Add both stories to the series
            await seriesService.addStoryToSeries(series.id, originalStory.id, 0);
            await seriesService.addStoryToSeries(series.id, sequelId, 1);
            console.log('Added both stories to the new series');
          }
          
          // Complete the process
          console.log('Sequel generation complete!');
          onComplete(sequelId);
        } catch (err: any) {
          // Only show error if we're not cancelling
          if (!isCancelling) {
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
          <DialogTitle>Creating Sequel</DialogTitle>
          <DialogDescription>
            {originalStory ? (
              <>Creating a sequel to "{originalStory.title}". Please wait while we generate your sequel.</>
            ) : (
              <>Please wait while we generate your sequel.</>
            )}
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
            </>
          )}
        </div>
        
        <Button variant="destructive" onClick={handleClose} className="mt-2">
          <X className="h-4 w-4 mr-2" />
          Cancel Sequel Generation
        </Button>
      </DialogContentWithoutCloseButton>
    </Dialog>
  );
} 