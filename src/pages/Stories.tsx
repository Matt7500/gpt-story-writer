import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Book, Plus, LogOut } from "lucide-react";
import { StoryGenerationModal } from "@/components/StoryGenerationModal";

interface Story {
  id: number;
  title: string;
  story_idea: string;
  plot_outline: string;
  characters: string;
  created_at: string;
}

export default function Stories() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStories(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching stories",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/auth');
    } catch (error: any) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCreateStory = () => {
    setIsGenerating(true);
  };

  const handleStoryGenerated = (storyId: number) => {
    setIsGenerating(false);
    // Refresh the stories list
    fetchStories();
    // Navigate to the editor with the new story
    navigate(`/editor/${storyId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <StoryGenerationModal 
        open={isGenerating} 
        onComplete={handleStoryGenerated}
        onClose={() => setIsGenerating(false)}
      />

      <header className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto p-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Stories</h1>
          <div className="flex items-center gap-4">
            <Button onClick={handleCreateStory} className="gap-2">
              <Plus className="h-4 w-4" />
              New Story
            </Button>
            <Button 
              variant="outline" 
              onClick={handleSignOut}
              className="gap-2 text-[#ea384c] dark:text-red-400 hover:text-[#ea384c] dark:hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {loading ? (
          <p className="text-muted-foreground">Loading stories...</p>
        ) : stories.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2">No stories yet</h2>
            <p className="text-muted-foreground mb-4">Start writing your first story!</p>
            <Button onClick={handleCreateStory}>
              Create New Story
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {stories.map((story) => (
              <div
                key={story.id}
                className="p-6 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/editor/${story.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Book className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h3 className="font-semibold">{story.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(story.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                  {story.story_idea}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
