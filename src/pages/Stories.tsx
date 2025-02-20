import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { StoryGenerationModal } from "@/components/StoryGenerationModal";
import { StoriesHeader } from "@/components/StoriesHeader";
import { StoryCard } from "@/components/StoryCard";
import { DeleteStoryDialog } from "@/components/DeleteStoryDialog";
import { Button } from "@/components/ui/button";
import { Story } from "@/types/story";
import { API_URL } from "@/lib/config";

export default function Stories() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<Story | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        fetchStories();
      } else {
        navigate('/auth');
      }
    };
    
    checkAuthAndFetch();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchStories();
      } else {
        navigate('/auth');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  const fetchStories = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user); // Debug log
      
      if (!user) throw new Error("No user found");

      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      console.log('Stories query result:', { data, error }); // Debug log
      if (error) throw error;
      
      // Transform the data to match Story type
      const transformedStories = (data || []).map(story => ({
        ...story,
        chapters: Array.isArray(story.chapters) ? story.chapters : JSON.parse(story.chapters as string)
      }));
      
      setStories(transformedStories);
    } catch (error: any) {
      console.error('Error in fetchStories:', error); // Debug log
      toast({
        title: "Error fetching stories",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setLoading(false);
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
    setIsGenerating(true);
  };

  const handleStoryGenerated = (storyId: string) => {
    setIsGenerating(false);
    fetchStories();
    navigate(`/editor/${storyId}`);
  };

  const handleDeleteStory = async () => {
    if (!storyToDelete) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const response = await fetch(`${API_URL}/api/stories/${storyToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete story');
      }

      toast({
        title: "Story deleted",
        description: "Your story has been successfully deleted.",
        duration: 3000,
      });

      setStories(stories.filter(story => story.id !== storyToDelete.id));
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

  return (
    <div className="min-h-screen bg-background">
      <StoryGenerationModal 
        open={isGenerating} 
        onComplete={handleStoryGenerated}
        onClose={() => setIsGenerating(false)}
      />

      <DeleteStoryDialog
        story={storyToDelete}
        onClose={() => setStoryToDelete(null)}
        onConfirm={handleDeleteStory}
      />

      <StoriesHeader
        onCreateStory={handleCreateStory}
        onSignOut={handleSignOut}
      />

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
              <StoryCard
                key={story.id}
                story={story}
                onDelete={setStoryToDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
