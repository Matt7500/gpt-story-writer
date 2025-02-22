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
  const [isCancelling, setIsCancelling] = useState(false);

  const cancelStoryGeneration = async () => {
    if (isCancelling) return; // Prevent multiple cancellation attempts
    
    setIsCancelling(true);
    try {
      // First, send the cancellation request to the backend
      if (clientId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const response = await fetch(`${API_URL}/api/stories/cancel`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ clientId })
          });

          if (!response.ok) {
            throw new Error('Failed to cancel story generation');
          }

          // After the backend acknowledges the cancellation, close the SSE connection
          if (eventSource) {
            console.log('Closing SSE connection...');
            eventSource.close();
            setEventSource(null);
          }
        }
      }
    } catch (error) {
      console.error('Error cancelling story generation:', error);
    } finally {
      setCurrentStep(0);
      setError(null);
      setProposedTitle(null);
      setClientId(null);
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setError(null);
      setProposedTitle(null);
      setIsCancelling(false);

      const generateStory = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            throw new Error('No active session');
          }

          // Generate a unique client ID for this story generation session
          const newClientId = Math.random().toString(36).substring(7);
          setClientId(newClientId);

          // Set up SSE connection with auth token
          const newEventSource = new EventSource(
            `${API_URL}/api/stories/progress?clientId=${newClientId}&auth_token=${session.access_token}`
          );
          setEventSource(newEventSource);
          
          newEventSource.onmessage = (event) => {
            // If we're cancelling, ignore any new messages
            if (isCancelling) {
              newEventSource.close();
              return;
            }

            try {
              const data = JSON.parse(event.data);
              if (data.cancelled) {
                newEventSource.close();
                return;
              }
              
              if (typeof data.step === 'number') {
                setCurrentStep(data.step);
              }
              if (data.title) {
                setProposedTitle(data.title);
              }
            } catch (error) {
              console.error('Error processing SSE message:', error);
            }
          };

          newEventSource.onerror = () => {
            if (newEventSource.readyState === EventSource.CLOSED) {
              console.log('SSE connection closed');
            } else {
              console.error('SSE connection error');
            }
            newEventSource.close();
            setEventSource(null);
          };

          // Start the story generation process
          const controller = new AbortController();
          const response = await fetch(`${API_URL}/api/stories/initialize`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ clientId: newClientId }),
            signal: controller.signal
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
          // Don't show error if we're cancelling
          if (!isCancelling) {
            console.error('Story generation error:', err);
            setError(err.message || 'An error occurred while generating the story');
          }
          // Clean up SSE connection on error
          if (eventSource) {
            eventSource.close();
            setEventSource(null);
          }
        }
      };

      generateStory();
    }

    return () => {
      if (eventSource || clientId) {
        cancelStoryGeneration();
      }
    };
  }, [open, onComplete, isCancelling]);

  const handleClose = async () => {
    await cancelStoryGeneration();
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