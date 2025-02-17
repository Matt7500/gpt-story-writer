
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { OutlinePanel } from "@/components/OutlinePanel";
import { WritingArea } from "@/components/WritingArea";
import { CharacterModal } from "@/components/CharacterModal";

// Sample data (in a real app, this would come from an API)
const sampleChapters = [
  { title: "Chapter 1: The Beginning", content: "", completed: false },
  { title: "Chapter 2: Rising Action", content: "", completed: false },
  { title: "Chapter 3: The Climax", content: "", completed: false },
  { title: "Chapter 4: Falling Action", content: "", completed: false },
  { title: "Chapter 5: Resolution", content: "", completed: false },
];

const sampleCharacters = [
  {
    name: "Alex Rivers",
    description: "A determined young journalist with a passion for uncovering the truth. Despite facing numerous obstacles, Alex maintains an unwavering commitment to investigative journalism.",
  },
  {
    name: "Sarah Chen",
    description: "A brilliant scientist working on groundbreaking research in artificial intelligence. Her work has the potential to change the world, but it also attracts unwanted attention.",
  },
  {
    name: "Marcus Thompson",
    description: "A charismatic business leader with a mysterious past. His public persona masks deeper motivations that become central to the story's conflict.",
  },
];

export default function Index() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentChapter, setCurrentChapter] = useState(0);
  const [chapters, setChapters] = useState(sampleChapters);
  const [showCharacters, setShowCharacters] = useState(false);

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
    // In a real app, this would be sent to an API
  };

  return (
    <div className="min-h-screen">
      <div className="flex justify-end p-4">
        <Button 
          variant="outline" 
          onClick={handleSignOut}
          className="text-sm"
        >
          Sign out
        </Button>
      </div>
      
      <div className="flex h-[calc(100vh-80px)] bg-secondary/30">
        <OutlinePanel
          chapters={chapters}
          currentChapter={currentChapter}
          onChapterSelect={setCurrentChapter}
          onShowCharacters={() => setShowCharacters(true)}
        />
        <main className="flex-1 overflow-auto">
          <div className="editor-container">
            <WritingArea
              chapter={chapters[currentChapter]}
              onSave={handleSave}
              onComplete={handleComplete}
              onFeedback={handleFeedback}
            />
          </div>
        </main>
        <CharacterModal
          isOpen={showCharacters}
          onClose={() => setShowCharacters(false)}
          characters={sampleCharacters}
        />
      </div>
    </div>
  );
}
