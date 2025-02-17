import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { OutlinePanel } from "@/components/OutlinePanel";
import { WritingArea } from "@/components/WritingArea";
import { CharacterModal } from "@/components/CharacterModal";

const sampleChapters = [
  { 
    title: "Chapter 1: The Beginning", 
    content: "", 
    completed: false,
    sceneBeat: "The protagonist discovers a mysterious letter that will change their life forever."
  },
  { 
    title: "Chapter 2: Rising Action", 
    content: "", 
    completed: false,
    sceneBeat: "Following the letter's clues, they encounter their first major obstacle and meet a key ally."
  },
  { 
    title: "Chapter 3: The Climax", 
    content: "", 
    completed: false,
    sceneBeat: "The truth behind the letter is revealed, leading to a confrontation with the antagonist."
  },
  { 
    title: "Chapter 4: Falling Action", 
    content: "", 
    completed: false,
    sceneBeat: "The aftermath of the confrontation affects all characters, leading to important decisions."
  },
  { 
    title: "Chapter 5: Resolution", 
    content: "", 
    completed: false,
    sceneBeat: "The protagonist comes to terms with the changes in their life and looks toward the future."
  },
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
      <div className="flex h-screen bg-secondary/30">
        <OutlinePanel
          chapters={chapters}
          currentChapter={currentChapter}
          onChapterSelect={setCurrentChapter}
          onShowCharacters={() => setShowCharacters(true)}
          onSignOut={handleSignOut}
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
