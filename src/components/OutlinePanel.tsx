
import { Book, ChevronRight, Users } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";

interface OutlinePanelProps {
  chapters: Chapter[];
  currentChapter: number;
  onChapterSelect: (index: number) => void;
  onShowCharacters: () => void;
}

interface Chapter {
  title: string;
  completed: boolean;
}

export function OutlinePanel({
  chapters,
  currentChapter,
  onChapterSelect,
  onShowCharacters,
}: OutlinePanelProps) {
  return (
    <div className="outline-panel h-screen flex flex-col">
      <div className="p-4 border-b border-border/40">
        <h2 className="font-semibold">Story Outline</h2>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2">
          {chapters.map((chapter, index) => (
            <Button
              key={index}
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
          ))}
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-border/40">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onShowCharacters}
        >
          <Users className="h-4 w-4" />
          <span>Characters</span>
        </Button>
      </div>
    </div>
  );
}
