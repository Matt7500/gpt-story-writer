
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Book, ArrowLeft, Plus } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={() => navigate('/editor')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Editor
            </Button>
            <h1 className="text-2xl font-bold">My Stories</h1>
          </div>
          <Button onClick={() => navigate('/editor')} className="gap-2">
            <Plus className="h-4 w-4" />
            New Story
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading stories...</p>
        ) : stories.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2">No stories yet</h2>
            <p className="text-muted-foreground mb-4">Start writing your first story!</p>
            <Button onClick={() => navigate('/editor')}>
              Create New Story
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {stories.map((story) => (
              <div
                key={story.id}
                className="p-6 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => navigate('/editor')}
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
      </div>
    </div>
  );
}
