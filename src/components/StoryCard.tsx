
import { Book, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Story } from "@/types/story";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StoryCardProps {
  story: Story;
  onDelete: (story: Story) => void;
}

export function StoryCard({ story, onDelete }: StoryCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Calculate word and character counts
  const getWordCount = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;
  const getCharCount = (text: string) => text.length;

  const totalWords = getWordCount(story.story_idea) + getWordCount(story.plot_outline);
  const totalChars = getCharCount(story.story_idea) + getCharCount(story.plot_outline);

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

      // Parse the plot outline to get chapters
      const chapters = JSON.parse(data.plot_outline);
      
      // Create the content string with chapters separated by three newlines
      let content = `${story.title}\n\n`;
      content += `Story Idea:\n${story.story_idea}\n\n\n`;
      
      // Add each chapter's content if it exists
      chapters.forEach((chapter: any, index: number) => {
        content += `Chapter ${index + 1}: ${chapter.title}\n\n`;
        if (chapter.content) {
          content += `${chapter.content}\n\n\n`;
        }
      });

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

  return (
    <div className="p-6 border rounded-lg hover:bg-accent/50 transition-colors group relative">
      <div 
        className="cursor-pointer"
        onClick={() => navigate(`/editor/${story.id}`)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Book className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">{story.title}</h3>
              <p className="text-sm text-muted-foreground">
                {new Date(story.created_at).toLocaleDateString()} • {totalWords.toLocaleString()} words • {totalChars.toLocaleString()} characters
              </p>
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
          {story.story_idea}
        </p>
      </div>
      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary"
          onClick={handleDownload}
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-red-600 hover:text-red-700 hover:bg-red-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(story);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
