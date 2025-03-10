import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { StoryGenerationModal } from "@/components/StoryGenerationModal";
import { SequelGenerationModal } from "@/components/SequelGenerationModal";
import { StoriesHeader } from "@/components/StoriesHeader";
import { StoryCard } from "@/components/StoryCard";
import { SeriesCard } from "@/components/SeriesCard";
import { DeleteStoryDialog } from "@/components/DeleteStoryDialog";
import { DeleteSeriesDialog } from "@/components/DeleteSeriesDialog";
import { CreateSequelDialog } from "@/components/CreateSequelDialog";
import { CreateSeriesDialog } from "@/components/CreateSeriesDialog";
import { AddStoryToSeriesDialog } from "@/components/AddStoryToSeriesDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Story } from "@/types/story";
import { Series } from "@/types/series";
import { useStoryService } from "@/hooks/use-story-service";
import { useSeriesService } from "@/hooks/use-series-service";
import { BookOpen, BookCopy } from "lucide-react";
import { setDocumentTitle } from "@/utils/document";
import { StorySourceSelectionModal, StorySource } from "@/components/StorySourceSelectionModal";
import { CustomStoryIdeaModal } from "@/components/CustomStoryIdeaModal";
import { AnimatePresence, motion } from "framer-motion";

export default function Stories() {
  const [stories, setStories] = useState<Story[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [activeTab, setActiveTab] = useState("stories");
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreatingSeries, setIsCreatingSeries] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<Story | null>(null);
  const [seriesToDelete, setSeriesToDelete] = useState<Series | null>(null);
  const [storyForSequel, setStoryForSequel] = useState<Story | null>(null);
  const [originalStoryForSequel, setOriginalStoryForSequel] = useState<Story | null>(null);
  const [isSequelGenerating, setIsSequelGenerating] = useState(false);
  const [seriesForAddStory, setSeriesForAddStory] = useState<Series | null>(null);
  const [isSourceSelectionOpen, setIsSourceSelectionOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<StorySource | null>(null);
  const [isCustomIdeaModalOpen, setIsCustomIdeaModalOpen] = useState(false);
  const [customStoryIdea, setCustomStoryIdea] = useState<string>("");
  const [previousTab, setPreviousTab] = useState<string | null>(null);
  const isMounted = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const storyService = useStoryService();
  const seriesService = useSeriesService();

  useEffect(() => {
    // Set document title
    setDocumentTitle("My Stories");
    
    // Set mounted flag
    isMounted.current = true;

    const checkAuthAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && isMounted.current) {
        // Force refresh to ensure we get the latest data
        fetchData(true);
      } else if (isMounted.current) {
        navigate('/auth');
      }
    };
    
    checkAuthAndFetch();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted.current) return;
      
      if (session?.user) {
        // Force refresh to ensure we get the latest data
        fetchData(true);
      } else {
        navigate('/auth');
      }
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const fetchData = async (forceRefresh: boolean = false) => {
    if (!isMounted.current) return;

    try {
      setLoading(true);
      
      // Fetch stories and series in parallel
      const [storiesData, seriesData] = await Promise.all([
        storyService.getUserStories(forceRefresh),
        seriesService.getUserSeries(forceRefresh)
      ]);
      
      // Transform the stories data to match Story type
      const transformedStories = (storiesData || []).map(story => ({
        ...story,
        chapters: Array.isArray(story.chapters) ? story.chapters : JSON.parse(story.chapters as string)
      }));
      
      setStories(transformedStories);
      setSeries(seriesData || []);
    } catch (error: any) {
      if (!isMounted.current) return;
      console.error('Error in fetchData:', error);
      toast({
        title: "Error fetching data",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const handleSignOut = async () => {
    try {
      // Clear local storage first
      localStorage.removeItem('sb-token');
      localStorage.clear(); // Clear all Supabase-related data
      
      const { error } = await supabase.auth.signOut({
        scope: 'local'  // Use local scope instead of global
      });
      if (error) throw error;
      
      navigate('/auth');
    } catch (error: any) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleCreateStory = () => {
    // If we're on the series tab, create a series instead of a story
    if (activeTab === "series") {
      setIsCreatingSeries(true);
    } else {
      // Open the source selection modal instead of directly starting generation
      setIsSourceSelectionOpen(true);
    }
  };

  const handleSourceSelection = (source: StorySource) => {
    setSelectedSource(source);
    setIsSourceSelectionOpen(false);
    
    if (source === 'custom') {
      // Open the custom idea modal
      setIsCustomIdeaModalOpen(true);
    } else {
      // Start generating with the selected source
      setIsGenerating(true);
    }
  };

  const handleCustomIdeaSubmit = async (customIdea: string) => {
    setIsCustomIdeaModalOpen(false);
    setCustomStoryIdea(customIdea);
    
    // Show the StoryGenerationModal with the custom idea
    setIsGenerating(true);
  };

  const handleCreateSeries = async (title: string, description: string) => {
    try {
      await seriesService.createSeries(title, description);
      toast({
        title: "Series Created",
        description: `"${title}" has been created successfully.`,
        duration: 3000,
      });
      fetchData(true);
    } catch (error: any) {
      toast({
        title: "Error creating series",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleStoryGenerated = (storyId: string) => {
    setIsGenerating(false);
    setSelectedSource(null);
    
    // Use setTimeout to ensure state updates complete before navigation
    setTimeout(() => {
      navigate(`/editor/${storyId}`);
    }, 10);
  };

  const handleCreateSequel = (story: Story) => {
    setStoryForSequel(story);
  };

  const handleConfirmSequel = async () => {
    if (!storyForSequel) return;
    
    // Store the original story for the sequel generation modal
    setOriginalStoryForSequel(storyForSequel);
    
    // First open the sequel generation modal while the confirmation dialog is still open
    // This ensures there's no gap between closing one and opening the other
    setIsSequelGenerating(true);
    
    // Then close the confirmation dialog after a short delay
    // This creates a smoother transition as the new modal is already visible
    setTimeout(() => {
      setStoryForSequel(null);
    }, 100);
  };
  
  const handleSequelGenerated = (sequelId: string) => {
    setIsSequelGenerating(false);
    setOriginalStoryForSequel(null);
    
    // Use setTimeout to ensure state updates complete before navigation
    setTimeout(() => {
      navigate(`/editor/${sequelId}`);
    }, 10);
  };

  const handleDeleteStory = async () => {
    if (!storyToDelete) return;

    try {
      // Use the StoryService to delete the story
      await storyService.deleteStory(storyToDelete.id);

      toast({
        title: "Story deleted",
        description: "Your story has been successfully deleted.",
        duration: 3000,
      });

      // Refresh the data with force refresh to bypass cache
      fetchData(true);
    } catch (error: any) {
      toast({
        title: "Error deleting story",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setStoryToDelete(null);
    }
  };

  const handleDeleteSeries = async () => {
    if (!seriesToDelete) return;

    try {
      // Use the SeriesService to delete the series
      await seriesService.deleteSeries(seriesToDelete.id);

      toast({
        title: "Series deleted",
        description: "Your series has been successfully deleted.",
        duration: 3000,
      });

      // Refresh the data with force refresh to bypass cache
      fetchData(true);
    } catch (error: any) {
      toast({
        title: "Error deleting series",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setSeriesToDelete(null);
    }
  };

  const handleAddStoryToSeries = (series: Series) => {
    setSeriesForAddStory(series);
  };

  const handleAddStoryComplete = () => {
    setSeriesForAddStory(null);
    fetchData(true);
  };

  const renderStories = () => {
    if (loading) {
      return <p className="text-muted-foreground">Loading stories...</p>;
    }
    
    if (stories.length === 0) {
      return (
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">No stories yet</h2>
          <p className="text-muted-foreground mb-4">
            Start writing your first story!
          </p>
          <Button 
            onClick={() => setIsSourceSelectionOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
          >
            Create New Story
          </Button>
        </div>
      );
    }
    
    return (
      <div className="grid gap-4">
        {stories.map((story, index) => (
          <motion.div
            key={story.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.2,
              delay: index * 0.05, // Stagger effect
              ease: "easeOut"
            }}
          >
            <StoryCard
              story={story}
              onDelete={setStoryToDelete}
              onCreateSequel={handleCreateSequel}
            />
          </motion.div>
        ))}
      </div>
    );
  };

  const renderSeries = () => {
    if (loading) {
      return <p className="text-muted-foreground">Loading series...</p>;
    }
    
    if (series.length === 0) {
      return (
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">No series yet</h2>
          <p className="text-muted-foreground mb-4">
            Create a series to organize your stories.
          </p>
          <Button onClick={() => setIsCreatingSeries(true)}>
            Create New Series
          </Button>
        </div>
      );
    }
    
    return (
      <div className="grid gap-4">
        {series.map((seriesItem, index) => (
          <motion.div
            key={seriesItem.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.2,
              delay: index * 0.05, // Stagger effect
              ease: "easeOut"
            }}
          >
            <SeriesCard
              series={seriesItem}
              onDelete={setSeriesToDelete}
              onAddStory={handleAddStoryToSeries}
            />
          </motion.div>
        ))}
      </div>
    );
  };

  // Handle tab change with animation direction tracking
  const handleTabChange = (value: string) => {
    setPreviousTab(activeTab);
    setActiveTab(value);
  };

  // Determine animation direction based on tab change
  const getAnimationDirection = (tabValue: string) => {
    if (!previousTab) return 0;
    
    if (tabValue === "stories" && previousTab === "series") {
      return -1; // Slide from left
    } else if (tabValue === "series" && previousTab === "stories") {
      return 1; // Slide from right
    }
    
    return 0;
  };

  return (
    <div className="min-h-screen bg-secondary/30">
      <StorySourceSelectionModal
        open={isSourceSelectionOpen}
        onClose={() => setIsSourceSelectionOpen(false)}
        onSelectSource={handleSourceSelection}
      />
      
      <CustomStoryIdeaModal
        open={isCustomIdeaModalOpen}
        onClose={() => setIsCustomIdeaModalOpen(false)}
        onSubmit={handleCustomIdeaSubmit}
      />
      
      <StoryGenerationModal 
        open={isGenerating} 
        onComplete={handleStoryGenerated}
        onClose={() => {
          setIsGenerating(false);
          setSelectedSource(null);
          setCustomStoryIdea("");
        }}
        source={selectedSource as 'reddit' | 'fine-tune' | 'custom'}
        customIdea={customStoryIdea}
      />
      
      <SequelGenerationModal
        open={isSequelGenerating}
        originalStory={originalStoryForSequel}
        onComplete={handleSequelGenerated}
        onClose={() => {
          setIsSequelGenerating(false);
          setOriginalStoryForSequel(null);
        }}
      />

      <CreateSeriesDialog
        open={isCreatingSeries}
        onClose={() => setIsCreatingSeries(false)}
        onConfirm={handleCreateSeries}
      />

      <AddStoryToSeriesDialog
        open={!!seriesForAddStory}
        series={seriesForAddStory}
        onClose={() => setSeriesForAddStory(null)}
        onComplete={handleAddStoryComplete}
      />

      <DeleteStoryDialog
        story={storyToDelete}
        onClose={() => setStoryToDelete(null)}
        onConfirm={handleDeleteStory}
      />

      <DeleteSeriesDialog
        series={seriesToDelete}
        onClose={() => setSeriesToDelete(null)}
        onConfirm={handleDeleteSeries}
      />

      <CreateSequelDialog
        story={storyForSequel}
        onClose={() => setStoryForSequel(null)}
        onConfirm={handleConfirmSequel}
      />

      <StoriesHeader
        onCreateStory={handleCreateStory}
        onSignOut={handleSignOut}
      />

      <main className="max-w-4xl mx-auto px-6 py-6">
        <Tabs 
          defaultValue="stories" 
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <div className="flex justify-center mb-6">
            <TabsList className="grid grid-cols-2 w-[400px]">
              <TabsTrigger value="stories" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                <span>Stories</span>
                {!loading && stories.length > 0 && (
                  <div 
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ml-1 transition-all duration-300 ease-in-out ${
                      activeTab === "stories" 
                        ? "bg-primary/20 text-primary" 
                        : "bg-muted-foreground/20"
                    }`}
                  >
                    {stories.length}
                  </div>
                )}
              </TabsTrigger>
              <TabsTrigger value="series" className="flex items-center gap-2">
                <BookCopy className="h-4 w-4" />
                <span>Series</span>
                {!loading && series.length > 0 && (
                  <div 
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ml-1 transition-all duration-300 ease-in-out ${
                      activeTab === "series" 
                        ? "bg-primary/20 text-primary" 
                        : "bg-muted-foreground/20"
                    }`}
                  >
                    {series.length}
                  </div>
                )}
              </TabsTrigger>
            </TabsList>
          </div>
          
          <div className="relative overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ 
                  opacity: 0
                }}
                animate={{ 
                  opacity: 1
                }}
                exit={{ 
                  opacity: 0
                }}
                transition={{ 
                  duration: 0.2,
                  ease: "easeOut"
                }}
                className="w-full"
              >
                {activeTab === "stories" && (
                  <div className="space-y-4">
                    {renderStories()}
                  </div>
                )}
                
                {activeTab === "series" && (
                  <div className="space-y-4">
                    {renderSeries()}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
