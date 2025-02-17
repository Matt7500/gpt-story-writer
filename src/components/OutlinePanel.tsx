
import { Book, ChevronRight, LogOut, Library, Settings } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

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

  return (
    <div className="outline-panel h-screen flex flex-col w-64 border-r">
      <div className="p-4 border-b border-border/40">
        <div className="space-y-2">
          <h2 className="font-semibold">Story</h2>
          <p className="text-sm text-muted-foreground">
            {totalWords} words • {totalChars} characters
          </p>
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
                currentChapter === index && "bg-primary/25 dark:bg-primary/40",
                chapter.completed && "text-muted-foreground"
              )}
              onClick={() => onChapterSelect(index)}
            >
              <Book className="h-4 w-4" />
              <span className="truncate">{chapter.title}</span>
              {chapter.completed && (
                <ChevronRight className="h-4 w-4 ml-auto opacity-60" />
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
