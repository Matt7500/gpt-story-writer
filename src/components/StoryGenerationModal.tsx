import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface StoryGenerationModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (storyId: number) => void;
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
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setError(null);

      const generateStory = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            throw new Error('No active session');
          }

          // Generate a unique client ID for this story generation session
          const clientId = Math.random().toString(36).substring(7);

          // Set up SSE connection
          const newEventSource = new EventSource(`http://localhost:3001/api/stories/progress?clientId=${clientId}`);
          setEventSource(newEventSource);
          
          newEventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            setCurrentStep(data.step);
          };

          newEventSource.onerror = () => {
            newEventSource.close();
            setEventSource(null);
          };

          // Start the story generation process
          const response = await fetch('http://localhost:3001/api/stories/initialize', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ clientId })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate story');
          }

          const data = await response.json();
          
          if (!data.success) {
            throw new Error(data.error || 'Failed to generate story');
          }

          // Close SSE connection
          newEventSource.close();
          setEventSource(null);

          // Complete the process
          onComplete(data.story.id);
        } catch (err: any) {
          console.error('Story generation error:', err);
          setError(err.message || 'An error occurred while generating the story');
          // Clean up SSE connection on error
          if (eventSource) {
            eventSource.close();
            setEventSource(null);
          }
        }
      };

      generateStory();
    }

    // Cleanup function
    return () => {
      if (eventSource) {
        console.log('Cleaning up story generation...');
        eventSource.close();
        setEventSource(null);
      }
    };
  }, [open, onComplete]);

  const handleClose = () => {
    // Clean up SSE connection
    if (eventSource) {
      console.log('Cancelling story generation...');
      eventSource.close();
      setEventSource(null);
    }
    setCurrentStep(0);
    setError(null);
    onClose();
  };

  // Add cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSource) {
        console.log('Cleaning up story generation...');
        eventSource.close();
        setEventSource(null);
      }
    };
  }, [eventSource]);

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 