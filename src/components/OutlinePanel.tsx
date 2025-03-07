import { Book, ChevronRight, LogOut, Library, Settings, CheckCircle } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Separator } from "./ui/separator";

interface OutlinePanelProps {
  chapters: Chapter[];
  currentChapter: number;
  onChapterSelect: (index: number) => void;
  onSignOut: () => void;
  onFinishStory?: () => void;
}

interface Chapter {
  title: string;
  completed: boolean;
  content?: string;
}

export function OutlinePanel({
  chapters,
  currentChapter,
  onChapterSelect,
  onSignOut,
  onFinishStory,
}: OutlinePanelProps) {
  const navigate = useNavigate();
  const totalWords = chapters.reduce((acc, chapter) => {
    const content = chapter.content || "";
    return acc + (content.trim() ? content.trim().split(/\s+/).length : 0);
  }, 0);

  const totalChars = chapters.reduce((acc, chapter) => {
    return acc + (chapter.content?.length || 0);
  }, 0);

  // Calculate estimated video duration based on audiobook narration speed (150 words per minute)
  const getEstimatedDuration = (wordCount: number) => {
    const minutes = Math.round(wordCount / 150);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  };

  return (
    <div className="outline-panel h-screen flex flex-col w-64 border-r">
      <div className="p-4 border-b border-border/40">
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="font-semibold text-lg">Story Overview</h2>
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <div className="flex justify-between items-center">
                <p className="text-xs uppercase font-medium text-foreground">Words</p>
                <p className="text-sm text-foreground">{totalWords.toLocaleString()}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs uppercase font-medium text-foreground">Characters</p>
                <p className="text-sm text-foreground">{totalChars.toLocaleString()}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs uppercase font-medium text-foreground">Est. Duration</p>
                <p className="text-sm text-foreground">{getEstimatedDuration(totalWords)}</p>
              </div>
            </div>
          </div>
          {onFinishStory && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2 dark:bg-accent/50 dark:hover:bg-green-900/50 dark:border-green-900/50 dark:text-green-400 hover:text-green-500 dark:hover:text-green-300"
              onClick={onFinishStory}
            >
              <Book className="h-4 w-4" />
              <span>Finish Story</span>
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2">
          {chapters.map((chapter, index) => (
            <Button
              key={index}
              variant={currentChapter === index ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-2 text-sm font-normal",
                "hover:bg-accent dark:hover:bg-accent/90",
                currentChapter === index && "bg-[#E6E4F4] dark:bg-primary/10",
                chapter.completed && "text-muted-foreground"
              )}
              onClick={() => onChapterSelect(index)}
            >
              <Book className="h-4 w-4" />
              <span className="truncate">{chapter.title}</span>
              {chapter.completed && (
                <CheckCircle className="h-4 w-4 ml-auto text-green-500 dark:text-green-400" />
              )}
            </Button>
          ))}
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-border/40 space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 dark:bg-accent/50 dark:hover:bg-accent/90 dark:border-accent/50"
          onClick={() => navigate('/')}
        >
          <Library className="h-4 w-4" />
          <span>My Stories</span>
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 dark:bg-accent/50 dark:hover:bg-accent/90 dark:border-accent/50"
          onClick={() => navigate('/settings')}
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 dark:bg-accent/50 dark:hover:bg-red-900/50 dark:border-red-900/50 text-[#ea384c] dark:text-red-400 hover:text-[#ea384c] dark:hover:text-red-300"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </Button>
      </div>
    </div>
  );
}
