import { useEffect, useState } from "react";
import { Book, Trash2, Download, GitBranch, ArrowRight, BookCopy, ChevronDown, ChevronUp, Copy, MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Story } from "@/types/story";
import { Series } from "@/types/series";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSeriesService } from "@/hooks/use-series-service";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { storyService } from "@/services/StoryService";

interface StoryCardProps {
  story: Story;
  onDelete: (story: Story) => void;
  onCreateSequel?: (story: Story) => void;
}

export function StoryCard({ story, onDelete, onCreateSequel }: StoryCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const seriesService = useSeriesService();
  const [parentStory, setParentStory] = useState<Story | null>(null);
  const [relatedStoriesCount, setRelatedStoriesCount] = useState<number>(0);
  const [relatedStories, setRelatedStories] = useState<Story[]>([]);
  const [isSeriesOpen, setIsSeriesOpen] = useState(false);
  const [firstStoryTitle, setFirstStoryTitle] = useState<string>("");
  const [seriesInfo, setSeriesInfo] = useState<Series | null>(null);
  const [hasSequel, setHasSequel] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(story.title);

  // Helper function to check if a story is a series
  const isSeries = (story: Story) => {
    // Convert to string and check if it's truthy
    return Boolean(story.is_series);
  };

  // Helper function to check if a story is a sequel
  const isSequel = (story: Story) => {
    // Convert to string and check if it's truthy
    return Boolean(story.is_sequel);
  };

  // Fetch parent story if this is a sequel
  useEffect(() => {
    if (story.parent_story_id) {
      const fetchParentStory = async () => {
        try {
          const { data, error } = await supabase
            .from('stories')
            .select('*')
            .eq('id', story.parent_story_id)
            .single();

          if (error) throw error;
          
          // Use type assertion to handle the data
          setParentStory(data as unknown as Story);
        } catch (error) {
          console.error('Error fetching parent story:', error);
        }
      };

      fetchParentStory();
    }
    
    // Fetch related stories if this is a series
    if (isSeries(story) && story.related_stories) {
      try {
        const relatedStoryIds = JSON.parse(story.related_stories as string);
        if (Array.isArray(relatedStoryIds)) {
          setRelatedStoriesCount(relatedStoryIds.length);
          
          // Fetch the related stories
          const fetchRelatedStories = async () => {
            try {
              if (relatedStoryIds.length === 0) return;
              
              const { data, error } = await supabase
                .from('stories')
                .select('*')
                .in('id', relatedStoryIds)
                .order('created_at', { ascending: true });
                
              if (error) throw error;
              
              if (data && data.length > 0) {
                // Transform the data to match Story type
                const stories = data.map(s => ({
                  ...s,
                  chapters: Array.isArray(s.chapters) ? s.chapters : JSON.parse(s.chapters as string)
                })) as Story[];
                
                setRelatedStories(stories);
                
                // Set the first story title
                if (stories.length > 0) {
                  setFirstStoryTitle(stories[0].title);
                }
              }
            } catch (error) {
              console.error('Error fetching related stories:', error);
            }
          };
          
          fetchRelatedStories();
        }
      } catch (error) {
        console.error('Error parsing related stories:', error);
      }
    }
  }, [story.parent_story_id, story.is_series, story.related_stories]);

  // Fetch series information for this story
  useEffect(() => {
    const fetchSeriesInfo = async () => {
      try {
        const series = await seriesService.getSeriesForStory(story.id);
        if (series) {
          setSeriesInfo(series);
        }
      } catch (error) {
        console.error('Error fetching series info:', error);
      }
    };

    fetchSeriesInfo();
  }, [story.id]);

  // Check if this story already has a sequel
  useEffect(() => {
    const checkForSequel = async () => {
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('id')
          .eq('parent_story_id', story.id)
          .limit(1);
          
        if (error) throw error;
        
        setHasSequel(data && data.length > 0);
      } catch (error) {
        console.error('Error checking for sequel:', error);
      }
    };
    
    if (!isSeries(story)) {
      checkForSequel();
    }
  }, [story.id]);

  // Calculate word and character counts
  const getWordCount = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;
  const getCharCount = (text: string) => text.length;

  // Calculate total words and characters from chapters only
  const totalWords = Array.isArray(story.chapters) ? story.chapters.reduce((acc, chapter) => 
    acc + getWordCount(chapter.content || ''), 0) : 0;

  const totalChars = Array.isArray(story.chapters) ? story.chapters.reduce((acc, chapter) => 
    acc + getCharCount(chapter.content || ''), 0) : 0;
    
  // Check if all chapters are completed
  const isStoryCompleted = Array.isArray(story.chapters) && story.chapters.length > 0 
    ? story.chapters.every(chapter => chapter.completed)
    : false;

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Fetch the full story content
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('id', story.id)
        .single();

      if (error) throw error;

      // Parse the chapters and create content string
      const chaptersData = data.chapters || '[]';
      const chapters = typeof chaptersData === 'string' ? JSON.parse(chaptersData) : chaptersData;
      let content = '';
      
      // Add each chapter's content, separated by three newlines
      if (Array.isArray(chapters)) {
        chapters.forEach((chapter: any, index: number) => {
          if (chapter.content) {
            content += chapter.content;
            // Add separator between chapters, but not after the last one
            if (index < chapters.length - 1) {
              content += '\n\n\n\n';
            }
          }
        });
      }

      // Create and download the file
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Story downloaded",
        description: "Your story has been downloaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error downloading story",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Fetch the full story content
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('id', story.id)
        .single();

      if (error) throw error;

      // Parse the chapters and create content string
      const chaptersData = data.chapters || '[]';
      const chapters = typeof chaptersData === 'string' ? JSON.parse(chaptersData) : chaptersData;
      let content = '';
      
      // Add each chapter's content, separated by three newlines
      if (Array.isArray(chapters)) {
        chapters.forEach((chapter: any, index: number) => {
          if (chapter.content) {
            content += chapter.content;
            // Add separator between chapters, but not after the last one
            if (index < chapters.length - 1) {
              content += '\n\n\n\n';
            }
          }
        });
      }

      // Copy to clipboard
      await navigator.clipboard.writeText(content);

      toast({
        title: "Story copied",
        description: "Your story has been copied to clipboard.",
      });
    } catch (error: any) {
      toast({
        title: "Error copying story",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const navigateToParentStory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (parentStory) {
      navigate(`/editor/${parentStory.id}`);
    }
  };
  
  const navigateToStory = (e: React.MouseEvent, storyId: string) => {
    e.stopPropagation();
    navigate(`/editor/${storyId}`);
  };

  // For series, we want to handle the click differently
  const handleCardClick = () => {
    if (isSeries(story)) {
      setIsSeriesOpen(!isSeriesOpen);
    } else {
      navigate(`/editor/${story.id}`);
    }
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

  const handleRenameStory = async () => {
    try {
      // Update the story title in the database
      await storyService.updateStory(story.id, { title: newTitle });
      
      // Close the dialog
      setIsRenameDialogOpen(false);
      
      // Show success toast
      toast({
        title: "Story renamed",
        description: "Your story has been renamed successfully.",
      });
      
      // Force a refresh of the page to show the updated title
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Error renaming story",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 rounded-lg bg-muted hover:bg-accent/50 transition-colors group">
      {isSeries(story) ? (
        <Collapsible
          open={isSeriesOpen}
          onOpenChange={setIsSeriesOpen}
          className="w-full"
        >
          <CollapsibleTrigger asChild>
            <div className="cursor-pointer relative">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4 pr-16">
                  <BookCopy className="h-5 w-5 text-purple-600 mt-1" />
                  <div className="space-y-1.5">
                    <h3 className="font-semibold text-lg">{story.title}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-muted-foreground">
                        {new Date(story.created_at).toLocaleDateString()} • {relatedStoriesCount} {relatedStoriesCount === 1 ? 'story' : 'stories'}
                      </span>
                      <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800 hover:bg-purple-200">
                        Series
                      </Badge>
                      {isStoryCompleted && (
                        <Badge 
                          variant="secondary" 
                          className="text-xs font-semibold bg-green-100 text-green-800 hover:bg-green-200"
                        >
                          Completed
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity [&:has([data-state=open])]:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="data-[state=open]:bg-accent/50 data-[state=open]:opacity-100 focus:ring-0 focus:ring-offset-0 hover:ring-0 hover:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent 
                        align="start" 
                        side="right"
                        sideOffset={5}
                        className="border-none cursor-pointer" 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem 
                          className="cursor-pointer" 
                          onClick={() => setIsRenameDialogOpen(true)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-red-600 focus:text-red-600 cursor-pointer" 
                          onClick={() => onDelete(story)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Series
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {isSeriesOpen ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="pl-9">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {story.story_idea}
                </p>
                {firstStoryTitle && (
                  <div className="mt-2 text-xs text-purple-700">
                    Begins with "{firstStoryTitle}"
                  </div>
                )}
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 pl-9 space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Stories in this series:</h4>
            <div className="space-y-2">
              {relatedStories.map((relatedStory, index) => (
                <div 
                  key={relatedStory.id}
                  className="p-3 bg-background rounded-md hover:bg-accent/30 cursor-pointer flex items-center justify-between"
                  onClick={(e) => navigateToStory(e, relatedStory.id)}
                >
                  <div>
                    <div className="font-medium">{index + 1}. {relatedStory.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {relatedStory.story_idea}
                    </div>
                    {Array.isArray(relatedStory.chapters) && relatedStory.chapters.length > 0 && 
                      relatedStory.chapters.every(chapter => chapter.completed) && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs font-semibold bg-green-100 text-green-800 hover:bg-green-200 mt-1"
                      >
                        Completed
                      </Badge>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <div 
          className="cursor-pointer relative"
          onClick={() => navigate(`/editor/${story.id}`)}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-4 pr-16">
              <Book className="h-5 w-5 text-muted-foreground mt-1" />
              <div className="space-y-1.5">
                <h3 className="font-semibold text-lg">{story.title}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">
                    {new Date(story.created_at).toLocaleDateString()} • {totalWords.toLocaleString()} words • {totalChars.toLocaleString()} characters
                  </span>
                  {seriesInfo ? (
                    <Badge 
                      variant="secondary" 
                      className="text-xs font-semibold"
                      style={{
                        backgroundColor: getSeriesColor(seriesInfo.id).bg,
                        color: getSeriesColor(seriesInfo.id).text
                      }}
                    >
                      Series
                    </Badge>
                  ) : null}
                  {isStoryCompleted && (
                    <Badge 
                      variant="secondary" 
                      className="text-xs font-semibold bg-green-100 text-green-800 hover:bg-green-200"
                    >
                      Completed
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity [&:has([data-state=open])]:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="data-[state=open]:bg-accent/50 data-[state=open]:opacity-100 focus:ring-0 focus:ring-offset-0 hover:ring-0 hover:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="start" 
                  side="right"
                  sideOffset={5}
                  className="border-none cursor-pointer" 
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenuItem 
                    className="cursor-pointer" 
                    onClick={() => setIsRenameDialogOpen(true)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  
                  {onCreateSequel && !isSeries(story) && (
                    <DropdownMenuItem 
                      disabled={hasSequel}
                      className="cursor-pointer"
                      onClick={() => {
                        if (!hasSequel && onCreateSequel) {
                          onCreateSequel(story);
                        }
                      }}
                    >
                      <GitBranch className="h-4 w-4 mr-2" />
                      Create Sequel
                      {hasSequel && <span className="ml-2 text-xs text-muted-foreground">(Already exists)</span>}
                    </DropdownMenuItem>
                  )}
                  
                  <DropdownMenuItem 
                    className="cursor-pointer"
                    onClick={handleCopy}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy to Clipboard
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem 
                    className="cursor-pointer"
                    onClick={handleDownload}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem 
                    className="text-red-600 focus:text-red-600 cursor-pointer" 
                    onClick={() => onDelete(story)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 pl-9">
            {story.story_idea}
          </p>
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename Story</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              id="title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Enter new title"
              className="col-span-3"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameStory} disabled={!newTitle.trim() || newTitle === story.title}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
