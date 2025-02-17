import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

interface Chapter {
  title: string;
  content: string;
  sceneBeat: string;
  completed: boolean;
}

interface StoryOutlineModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: Chapter[];
}

export function StoryOutlineModal({
  isOpen,
  onClose,
  chapters,
}: StoryOutlineModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Story Outline</DialogTitle>
          <DialogDescription>
            A chapter-by-chapter breakdown of your story.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] mt-4 pr-4 -mr-4">
          <div className="space-y-6 pr-2">
            {chapters.map((chapter, index) => (
              <div key={index} className="space-y-2 p-4 rounded-lg bg-muted/50">
                <h3 className="font-medium">{chapter.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {chapter.sceneBeat}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
} 