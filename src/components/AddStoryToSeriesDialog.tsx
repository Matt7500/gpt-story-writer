import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Series } from "@/types/series";
import { Story } from "@/types/story";
import { useStoryService } from "@/hooks/use-story-service";
import { useSeriesService } from "@/hooks/use-series-service";
import { useToast } from "@/hooks/use-toast";

interface AddStoryToSeriesDialogProps {
  open: boolean;
  series: Series | null;
  onClose: () => void;
  onComplete: () => void;
}

export function AddStoryToSeriesDialog({ open, series, onClose, onComplete }: AddStoryToSeriesDialogProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [seriesStories, setSeriesStories] = useState<string[]>([]);
  const storyService = useStoryService();
  const seriesService = useSeriesService();
  const { toast } = useToast();

  // Fetch stories when dialog opens
  useEffect(() => {
    if (open && series) {
      fetchData();
    } else {
      // Reset state when dialog closes
      setSelectedStoryIds([]);
    }
  }, [open, series]);

  const fetchData = async () => {
    if (!series) return;
    
    setLoading(true);
    try {
      // Fetch all user stories
      const allStories = await storyService.getUserStories(true);
      
      // Fetch series with its stories
      const seriesWithStories = await seriesService.getSeriesWithStories(series.id);
      
      // Get IDs of stories already in the series
      const existingStoryIds = seriesWithStories.stories.map(story => story.id);
      setSeriesStories(existingStoryIds);
      
      // Filter out stories that are already in the series
      const availableStories = allStories.filter(story => {
        // Parse chapters if needed
        if (typeof story.chapters === 'string') {
          story.chapters = JSON.parse(story.chapters);
        }
        return true;
      });
      
      setStories(availableStories);
    } catch (error: any) {
      toast({
        title: "Error loading stories",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStory = (storyId: string) => {
    setSelectedStoryIds(prev => {
      if (prev.includes(storyId)) {
        return prev.filter(id => id !== storyId);
      } else {
        return [...prev, storyId];
      }
    });
  };

  const handleSubmit = async () => {
    if (!series || selectedStoryIds.length === 0) return;
    
    setSubmitting(true);
    try {
      // Add each selected story to the series
      for (const storyId of selectedStoryIds) {
        await seriesService.addStoryToSeries(series.id, storyId);
      }
      
      toast({
        title: "Stories added to series",
        description: `Successfully added ${selectedStoryIds.length} ${selectedStoryIds.length === 1 ? 'story' : 'stories'} to "${series.title}"`,
      });
      
      onComplete();
    } catch (error: any) {
      toast({
        title: "Error adding stories to series",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isInSeries = (storyId: string) => seriesStories.includes(storyId);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Stories to Series</DialogTitle>
          <DialogDescription>
            {series ? `Select stories to add to "${series.title}"` : "Select stories to add to this series"}
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="py-6 text-center">Loading stories...</div>
        ) : stories.length === 0 ? (
          <div className="py-6 text-center">No stories available to add.</div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {stories.map(story => (
                <div key={story.id} className="flex items-start space-x-3 py-2">
                  <Checkbox 
                    id={`story-${story.id}`}
                    checked={selectedStoryIds.includes(story.id)}
                    onCheckedChange={() => handleToggleStory(story.id)}
                    disabled={isInSeries(story.id)}
                  />
                  <div className="grid gap-1.5">
                    <Label 
                      htmlFor={`story-${story.id}`}
                      className={`font-medium ${isInSeries(story.id) ? 'text-muted-foreground' : ''}`}
                    >
                      {story.title}
                      {isInSeries(story.id) && " (Already in series)"}
                    </Label>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {story.story_idea}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        
        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={selectedStoryIds.length === 0 || submitting}
          >
            {submitting ? "Adding..." : "Add to Series"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 