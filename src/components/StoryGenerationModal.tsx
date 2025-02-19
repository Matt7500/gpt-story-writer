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
import { Loader2, Check, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { API_URL } from "@/lib/config";
import { Button } from "./ui/button";

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
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [proposedTitle, setProposedTitle] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setError(null);
      setProposedTitle(null);

      const generateStory = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            throw new Error('No active session');
          }

          // Generate a unique client ID for this story generation session
          const newClientId = Math.random().toString(36).substring(7);
          setClientId(newClientId);

          // Set up SSE connection
          const newEventSource = new EventSource(`${API_URL}/api/stories/progress?clientId=${newClientId}`);
          setEventSource(newEventSource);
          
          newEventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (typeof data.step === 'number') {
              setCurrentStep(data.step);
            }
            if (data.title) {
              setProposedTitle(data.title);
            }
          };

          newEventSource.onerror = () => {
            newEventSource.close();
            setEventSource(null);
          };

          // Start the story generation process
          const response = await fetch(`${API_URL}/api/stories/initialize`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ clientId: newClientId })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate story');
          }

          const data = await response.json();
          
          if (!data.success) {
            throw new Error(data.error || 'Failed to generate story');
          }

          // Don't complete immediately - wait for user approval of title
          if (!data.waitingForTitleApproval) {
            // Close SSE connection
            newEventSource.close();
            setEventSource(null);
            // Complete the process
            onComplete(data.story.id);
          }
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
    setProposedTitle(null);
    onClose();
  };

  const handleTitleApproval = async (approved: boolean) => {
    if (!clientId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const response = await fetch(`${API_URL}/api/stories/approve-title`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          clientId,
          approved,
          title: proposedTitle
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process title approval');
      }

      if (!approved) {
        // Reset proposed title and wait for new one
        setProposedTitle(null);
      }
    } catch (error: any) {
      console.error('Title approval error:', error);
      setError(error.message || 'An error occurred while processing title approval');
    }
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

              {/* Title Approval UI */}
              {proposedTitle && currentStep === 1 && (
                <div className="mt-6 p-4 border rounded-lg">
                  <h3 className="text-lg font-semibold mb-2">Proposed Title:</h3>
                  <p className="text-xl mb-4">{proposedTitle}</p>
                  <div className="flex gap-2">
                    <Button 
                      variant="default" 
                      onClick={() => handleTitleApproval(true)}
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Accept Title
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => handleTitleApproval(false)}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Generate New Title
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 