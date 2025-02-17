import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { OutlinePanel } from "@/components/OutlinePanel";
import { WritingArea } from "@/components/WritingArea";
import { CharacterModal } from "@/components/CharacterModal";

interface Chapter {
  title: string;
  content: string;
  completed: boolean;
  sceneBeat: string;
}

interface Character {
  name: string;
  description: string;
}

interface Story {
  id: string;
  title: string;
  story_idea: string;
  plot_outline: string;
  characters: string;
}

export default function Editor() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { id } = useParams(); // Get story ID from URL
  const [loading, setLoading] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [story, setStory] = useState<Story | null>(null);
  const [showCharacters, setShowCharacters] = useState(false);

  useEffect(() => {
    // If no ID is provided, redirect to stories page
    if (!id) {
      navigate('/stories');
      return;
    }

    const loadStory = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate('/auth');
          return;
        }

        const { data: storyData, error } = await supabase
          .from('stories')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          console.error('Error loading story:', error);
          throw new Error(error.message || 'Story not found');
        }

        if (!storyData) {
          throw new Error('Story not found');
        }

        setStory(storyData);

        // Parse the plot outline into chapters
        const outline = JSON.parse(storyData.plot_outline);
        const formattedChapters = outline.map((sceneBeat: string, index: number) => ({
          title: `Chapter ${index + 1}`,
          content: "",
          completed: false,
          sceneBeat
        }));

        // Parse the characters
        const parsedCharacters = storyData.characters
          .match(/<character[^>]*>(.*?)<\/character>/g)
          ?.map(char => {
            const nameMatch = char.match(/name='([^']*)'/) || [];
            const descMatch = char.match(/>(.*?)<\/character>/) || [];
            return {
              name: nameMatch[1] || 'Unknown',
              description: descMatch[1] || ''
            };
          }) || [];

        setChapters(formattedChapters);
        setCharacters(parsedCharacters);
        setLoading(false);
      } catch (error: any) {
        toast({
          title: "Error loading story",
          description: error.message,
          variant: "destructive",
        });
        navigate('/stories');
      }
    };

    loadStory();
  }, [id, navigate, toast]);

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSave = (content: string) => {
    const updatedChapters = [...chapters];
    updatedChapters[currentChapter] = {
      ...updatedChapters[currentChapter],
      content,
    };
    setChapters(updatedChapters);
  };

  const handleComplete = () => {
    const updatedChapters = [...chapters];
    updatedChapters[currentChapter] = {
      ...updatedChapters[currentChapter],
      completed: true,
    };
    setChapters(updatedChapters);
  };

  const handleFeedback = (feedback: string) => {
    console.log("Feedback received:", feedback);
  };

  const handleFinishStory = () => {
    // Add logic for finishing the story
    toast({
      title: "Story Completed",
      description: "Congratulations on finishing your story!",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading story...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="flex h-screen bg-secondary/30">
        <OutlinePanel
          chapters={chapters}
          currentChapter={currentChapter}
          onChapterSelect={setCurrentChapter}
          onSignOut={handleSignOut}
          onFinishStory={handleFinishStory}
        />
        <main className="flex-1 overflow-auto">
          <div className="editor-container">
            <WritingArea
              chapter={chapters[currentChapter]}
              chapters={chapters}
              characters={story?.characters || ""}
              onSave={handleSave}
              onComplete={handleComplete}
              onFeedback={handleFeedback}
              onShowCharacters={() => setShowCharacters(true)}
            />
          </div>
        </main>
        <CharacterModal
          isOpen={showCharacters}
          onClose={() => setShowCharacters(false)}
          characters={characters}
        />
      </div>
    </div>
  );
}
