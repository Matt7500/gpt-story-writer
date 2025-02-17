
import { Book, ChevronRight, Users, LogOut } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";
import { Separator } from "./ui/separator";

interface OutlinePanelProps {
  chapters: Chapter[];
  currentChapter: number;
  onChapterSelect: (index: number) => void;
  onShowCharacters: () => void;
  onSignOut: () => void;
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
  onShowCharacters,
  onSignOut,
}: OutlinePanelProps) {
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
        <h2 className="font-semibold">Story</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {totalWords} words • {totalChars} characters
        </p>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2">
          {chapters.map((chapter, index) => {
            const wordCount = chapter.content?.trim() 
              ? chapter.content.trim().split(/\s+/).length 
              : 0;
            return (
              <div key={index} className="space-y-1">
                <Button
                  variant={currentChapter === index ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-2 text-sm font-normal",
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
                <p className="text-xs text-muted-foreground pl-9">
                  {wordCount} words
                </p>
                {index < chapters.length - 1 && (
                  <Separator className="my-2" />
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-border/40 space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onShowCharacters}
        >
          <Users className="h-4 w-4" />
          <span>Characters</span>
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-[#ea384c] dark:text-red-400 hover:text-[#ea384c] dark:hover:text-red-400"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </Button>
      </div>
    </div>
  );
}
