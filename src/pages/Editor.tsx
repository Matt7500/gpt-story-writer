import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { OutlinePanel } from "@/components/OutlinePanel";
import { WritingArea } from "@/components/WritingArea";
import { CharacterModal } from "@/components/CharacterModal";
import { ExportModal } from "@/components/ExportModal";
import debounce from "lodash/debounce";

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
  chapters: Array<{
    title: string;
    content: string;
    completed: boolean;
  }> | null;
  user_id: string;
  created_at: string;
}

interface SaveState {
  lastSavedContent: string;
  lastSavedTimestamp: number;
  pendingChanges: boolean;
  error: string | null;
  retryCount: number;
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
  const [showExportModal, setShowExportModal] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({
    lastSavedContent: '',
    lastSavedTimestamp: Date.now(),
    pendingChanges: false,
    error: null,
    retryCount: 0
  });
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const maxRetries = 3;
  const saveInterval = 5000; // 5 seconds

  // Save chapters to local storage with versioning
  const saveToLocalStorage = useCallback((updatedChapters: Chapter[]) => {
    if (id) {
      try {
        const saveData = {
          chapters: updatedChapters,
          timestamp: Date.now(),
          version: 1, // Increment this when changing structure
        };
        localStorage.setItem(`story_${id}_chapters`, JSON.stringify(saveData));
        localStorage.setItem(`story_${id}_lastEdit`, new Date().toISOString());
      } catch (error) {
        console.error('Error saving to local storage:', error);
        toast({
          title: "Local save failed",
          description: "Changes will be saved when connection is restored.",
          variant: "destructive",
        });
      }
    }
  }, [id, toast]);

  // Save chapters to database with retry logic
  const saveToDatabase = useCallback(async (updatedChapters: Chapter[], isRetry = false) => {
    if (!id) return;

    try {
      setSaveState(prev => ({ ...prev, pendingChanges: true }));
      
      // Save to local storage first as backup
      saveToLocalStorage(updatedChapters);
      
      // Prepare chapter data for database
      const chapterData = updatedChapters.map(chapter => ({
        title: chapter.title,
        content: chapter.content,
        completed: chapter.completed
      }));

      const { error } = await supabase
        .from('stories')
        .update({ 
          chapters: chapterData 
        } as any)
        .eq('id', id);

      if (error) throw error;

      // Update save state on success
      setSaveState(prev => ({
        ...prev,
        lastSavedContent: JSON.stringify(updatedChapters),
        lastSavedTimestamp: Date.now(),
        pendingChanges: false,
        error: null,
        retryCount: 0
      }));

      // Only clear local storage if we have a successful database save
      if (!isRetry) {
        const localData = localStorage.getItem(`story_${id}_chapters`);
        if (localData) {
          const parsedData = JSON.parse(localData);
          // Only clear if we're saving the same or newer version
          if (parsedData.timestamp <= Date.now()) {
            localStorage.removeItem(`story_${id}_chapters`);
            localStorage.removeItem(`story_${id}_lastEdit`);
          }
        }
      }
    } catch (error: any) {
      console.error('Error saving to database:', error);
      
      // Handle retry logic
      setSaveState(prev => {
        const newRetryCount = prev.retryCount + 1;
        if (newRetryCount < maxRetries) {
          // Schedule retry with exponential backoff
          const backoffTime = Math.min(1000 * Math.pow(2, newRetryCount), 30000);
          setTimeout(() => saveToDatabase(updatedChapters, true), backoffTime);
        }
        
        return {
          ...prev,
          error: error.message,
          retryCount: newRetryCount,
          pendingChanges: true
        };
      });

      // Show error toast only on final retry failure
      if (!isRetry || saveState.retryCount >= maxRetries) {
        toast({
          title: "Error saving changes",
          description: "Your work is saved locally and will sync when connection is restored.",
          variant: "destructive",
        });
      }
    }
  }, [id, saveToLocalStorage, toast]);

  // Auto-save handler with debounce
  useEffect(() => {
    const handleAutoSave = () => {
      if (saveState.pendingChanges) {
        saveToDatabase(chapters);
      }
    };

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    saveTimeoutRef.current = setTimeout(handleAutoSave, saveInterval);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [chapters, saveState.pendingChanges, saveToDatabase]);

  // Handle chapter updates
  const handleChapterUpdate = useCallback((updatedChapters: Chapter[]) => {
    setChapters(updatedChapters);
    setSaveState(prev => ({ ...prev, pendingChanges: true }));
    saveToLocalStorage(updatedChapters);
  }, [saveToLocalStorage]);

  // Recovery system
  useEffect(() => {
    if (!id) return;

    const attemptRecovery = async () => {
      try {
        const localData = localStorage.getItem(`story_${id}_chapters`);
        if (localData) {
          const { chapters: localChapters, timestamp } = JSON.parse(localData);
          
          // Check if local changes are newer than last database save
          if (timestamp > saveState.lastSavedTimestamp) {
            // Prompt user about recovery
            const shouldRecover = window.confirm(
              "We found unsaved changes from your last session. Would you like to recover them?"
            );
            
            if (shouldRecover) {
              setChapters(localChapters);
              setSaveState(prev => ({ 
                ...prev, 
                pendingChanges: true,
                lastSavedContent: JSON.stringify(localChapters)
              }));
            } else {
              // Clear local storage if user declines recovery
              localStorage.removeItem(`story_${id}_chapters`);
              localStorage.removeItem(`story_${id}_lastEdit`);
            }
          }
        }
      } catch (error) {
        console.error('Error during recovery:', error);
      }
    };

    attemptRecovery();
  }, [id]);

  // Save when leaving the page
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveState.pendingChanges) {
        e.preventDefault();
        e.returnValue = '';
        // Attempt one final save
        saveToDatabase(chapters);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Final save when component unmounts
      if (saveState.pendingChanges) {
        saveToDatabase(chapters);
      }
    };
  }, [chapters, saveState.pendingChanges, saveToDatabase]);

  // Add function to check if chapter should be marked as complete
  const isChapterComplete = (content: string) => {
    const wordCount = content.trim().split(/\s+/).length;
    return wordCount >= 500; // Consider a chapter complete if it has at least 500 words
  };

  // Load story and handle recovery
  useEffect(() => {
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

        // Check for local storage data first
        const localChapters = localStorage.getItem(`story_${id}_chapters`);
        const lastEdit = localStorage.getItem(`story_${id}_lastEdit`);

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

        // Cast the story data to include chapters
        const storyWithChapters: Story = {
          ...storyData,
          chapters: (storyData as any).chapters || null
        };

        setStory(storyWithChapters);

        // Parse the plot outline into chapters
        const outline = JSON.parse(storyData.plot_outline);
        
        // Create base chapters from the outline
        const baseChapters = outline.map((sceneBeat: string, index: number) => ({
          title: `Chapter ${index + 1}`,
          content: "",
          completed: false,
          sceneBeat
        }));

        // Merge chapters in this order of priority:
        // 1. Local storage (most recent)
        // 2. Database saved chapters
        // 3. Base chapters from outline (fallback)
        let formattedChapters;
        if (localChapters && lastEdit) {
          // Use local storage data if available
          const savedChapters = JSON.parse(localChapters).chapters;
          formattedChapters = baseChapters.map((baseChapter, index) => ({
            ...baseChapter,
            content: savedChapters[index]?.content || "",
            completed: savedChapters[index]?.completed || isChapterComplete(savedChapters[index]?.content || "")
          }));
          
          toast({
            title: "Recovered unsaved changes",
            description: "Your previous work has been restored.",
            duration: 3000,
          });
        } else if (storyWithChapters.chapters) {
          // Use database chapters if available
          const savedChapters = storyWithChapters.chapters;
          formattedChapters = baseChapters.map((baseChapter, index) => ({
            ...baseChapter,
            content: savedChapters[index]?.content || "",
            completed: savedChapters[index]?.completed || isChapterComplete(savedChapters[index]?.content || "")
          }));
        } else {
          // Fall back to base chapters
          formattedChapters = baseChapters;
        }

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

  // Ensure currentChapter is valid
  useEffect(() => {
    if (chapters.length > 0 && currentChapter >= chapters.length) {
      setCurrentChapter(0);
    }
  }, [chapters, currentChapter]);

  const handleSignOut = async () => {
    try {
      // Save before signing out
      await saveToDatabase(chapters);
      
      // Clear local storage first
      localStorage.removeItem('sb-token');
      localStorage.clear(); // Clear all Supabase-related data
      
      const { error } = await supabase.auth.signOut({
        scope: 'local'  // Use local scope instead of global
      });
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
      completed: isChapterComplete(content), // Automatically update completed status
    };
    handleChapterUpdate(updatedChapters);
  };

  const handleComplete = () => {
    const updatedChapters = [...chapters];
    updatedChapters[currentChapter] = {
      ...updatedChapters[currentChapter],
      completed: true,
    };
    handleChapterUpdate(updatedChapters);
  };

  const handleFeedback = (feedback: string) => {
    console.log("Feedback received:", feedback);
  };

  const handleFinishStory = async () => {
    try {
      // Save one final time
      await saveToDatabase(chapters);
      setShowExportModal(true);
    } catch (error: any) {
      toast({
        title: "Error saving story",
        description: error.message,
        variant: "destructive",
      });
    }
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
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          chapters={chapters}
        />
      </div>
    </div>
  );
}
