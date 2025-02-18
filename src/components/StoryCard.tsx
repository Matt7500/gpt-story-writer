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

      // Get the chapters array directly (no need to parse)
      const chapters = data.chapters || [];
      let content = '';
      
      // Add each chapter's content, separated by four newlines
      chapters.forEach((chapter: any) => {
        if (chapter.content) {
          content += `${chapter.content}\n\n\n\n`;
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
        duration: 3000,
      });
    } catch (error: any) {
      toast({
        title: "Error downloading story",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  return (
    <div className="p-6 border rounded-lg hover:bg-accent/50 transition-colors group">
      <div 
        className="cursor-pointer relative"
        onClick={() => navigate(`/editor/${story.id}`)}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4 pr-16">
            <Book className="h-5 w-5 text-muted-foreground mt-1" />
            <div className="space-y-1.5">
              <h3 className="font-semibold text-lg">{story.title}</h3>
              <p className="text-sm text-muted-foreground">
                {new Date(story.created_at).toLocaleDateString()} • {totalWords.toLocaleString()} words • {totalChars.toLocaleString()} characters
              </p>
            </div>
          </div>
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
        <p className="text-sm text-muted-foreground line-clamp-2 pl-9">
          {story.story_idea}
        </p>
      </div>
    </div>
  );
}
