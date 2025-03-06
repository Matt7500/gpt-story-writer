import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookCopy, Trash2, ChevronDown, ChevronUp, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Series, SeriesWithStories } from "@/types/series";
import { useToast } from "@/hooks/use-toast";
import { useSeriesService } from "@/hooks/use-series-service";
import { AnimatePresence, motion } from "framer-motion";

interface SeriesCardProps {
  series: Series;
  onDelete: (series: Series) => void;
  onAddStory?: (series: Series) => void;
}

export function SeriesCard({ series, onDelete, onAddStory }: SeriesCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const seriesService = useSeriesService();
  const [isOpen, setIsOpen] = useState(false);
  const [seriesWithStories, setSeriesWithStories] = useState<SeriesWithStories | null>(null);
  const [loading, setLoading] = useState(false);

  // Load series stories when component mounts
  useEffect(() => {
    fetchSeriesStories();
  }, []);

  const fetchSeriesStories = async () => {
    if (loading || seriesWithStories) return;
    
    setLoading(true);
    try {
      const data = await seriesService.getSeriesWithStories(series.id);
      setSeriesWithStories(data);
    } catch (error: any) {
      console.error("Error loading series stories:", error);
      // Don't show toast on initial load to avoid too many notifications
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    // Toggle the open state
    setIsOpen(!isOpen);
    
    // Fetch stories if not already loaded and we're opening the dropdown
    if (!seriesWithStories && !loading && !isOpen) {
      try {
        setLoading(true);
        const data = await seriesService.getSeriesWithStories(series.id);
        setSeriesWithStories(data);
      } catch (error: any) {
        console.error("Error loading series stories:", error);
        toast({
          title: "Error loading stories",
          description: error.message || "Failed to load stories for this series",
          variant: "destructive",
          duration: 3000,
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const navigateToStory = (e: React.MouseEvent, storyId: string) => {
    e.stopPropagation();
    navigate(`/editor/${storyId}`);
  };

  // Format the story number with leading zeros for a cleaner look
  const formatStoryNumber = (index: number, total: number) => {
    // Determine how many digits we need based on total stories
    const digits = total >= 100 ? 3 : total >= 10 ? 2 : 1;
    return `Part ${String(index + 1).padStart(digits, '0')}`;
  };

  // Generate a consistent color based on series ID
  const getSeriesColor = (seriesId: string) => {
    // Simple hash function to generate a number from a string
    const hash = seriesId.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    // Generate hue (0-360), with good saturation and lightness for pastel colors
    const hue = Math.abs(hash) % 360;
    
    return {
      bg: `hsla(${hue}, 85%, 92%, 1)`,
      text: `hsla(${hue}, 90%, 25%, 1)`,
      hover: `hsla(${hue}, 85%, 90%, 1)`
    };
  };

  const seriesColors = getSeriesColor(series.id);

  return (
    <div className="p-6 rounded-lg bg-muted hover:bg-accent/50 transition-colors group">
      <Collapsible
        open={isOpen}
        onOpenChange={handleToggle}
        className="w-full"
      >
        <CollapsibleTrigger asChild>
          <div className="cursor-pointer relative">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-4 pr-16">
                <BookCopy className="h-5 w-5 text-muted-foreground mt-1" />
                <div className="space-y-1.5">
                  <h3 className="font-semibold text-lg">{series.title}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground">
                      {new Date(series.created_at).toLocaleDateString()}
                    </span>
                    <Badge 
                      variant="secondary" 
                      className="text-xs font-semibold"
                      style={{
                        backgroundColor: seriesColors.bg,
                        color: seriesColors.text
                      }}
                    >
                      Series
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onAddStory && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onAddStory) {
                          onAddStory(series);
                        }
                      }}
                      title="Add Story to Series"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:text-red-700 hover:bg-red-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(series);
                    }}
                    title="Delete Series"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                </motion.div>
              </div>
            </div>
            <div className="pl-9">
              {loading ? (
                <div className="text-sm text-muted-foreground">
                  Loading stories...
                </div>
              ) : seriesWithStories?.stories && seriesWithStories.stories.length > 0 ? (
                <div className="text-sm text-muted-foreground font-medium">
                  {seriesWithStories.stories.length} {seriesWithStories.stories.length === 1 ? 'story' : 'stories'} in this series
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No stories in this series yet
                </div>
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <AnimatePresence initial={false}>
          {isOpen && (
            <CollapsibleContent className="mt-4 pl-9 space-y-3 overflow-hidden" forceMount>
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                {loading ? (
                  <div className="text-sm text-muted-foreground">Loading stories...</div>
                ) : seriesWithStories?.stories && seriesWithStories.stories.length > 0 ? (
                  <div className="space-y-3">
                    {seriesWithStories.stories.map((story, index) => (
                      <motion.div 
                        key={story.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ 
                          duration: 0.2, 
                          delay: index * 0.05,
                          ease: "easeOut"
                        }}
                        className="p-4 bg-background rounded-md hover:bg-accent/30 cursor-pointer"
                        onClick={(e) => navigateToStory(e, story.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant="outline" 
                                className="text-xs font-semibold"
                                style={{
                                  backgroundColor: seriesColors.bg,
                                  color: seriesColors.text
                                }}
                              >
                                {formatStoryNumber(index, seriesWithStories.stories.length)}
                              </Badge>
                              <h4 className="font-medium text-base">{story.title}</h4>
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground line-clamp-3">
                              {story.story_idea}
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground mt-1 ml-2 flex-shrink-0" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No stories in this series yet.</div>
                )}
              </motion.div>
            </CollapsibleContent>
          )}
        </AnimatePresence>
      </Collapsible>
    </div>
  );
} 