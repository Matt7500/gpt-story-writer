import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookOpen, MessageSquare, Lightbulb, PenTool } from "lucide-react";

export type StorySource = "reddit" | "fine-tune" | "custom";

interface StorySourceSelectionModalProps {
  open: boolean;
  onClose: () => void;
  onSelectSource: (source: StorySource) => void;
}

export function StorySourceSelectionModal({ 
  open, 
  onClose, 
  onSelectSource 
}: StorySourceSelectionModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Create a New Story</DialogTitle>
          <DialogDescription>
            Choose how you want to generate your story idea
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <Button 
            onClick={() => onSelectSource("reddit")}
            variant="outline" 
            className="flex items-center justify-start gap-3 p-6 h-auto hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-all"
          >
            <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-full">
              <MessageSquare className="h-5 w-5 text-red-500 dark:text-red-400" />
            </div>
            <div className="text-left">
              <h3 className="font-medium text-base">Reddit Inspiration</h3>
              <p className="text-sm text-muted-foreground">
                Generate a story idea based on popular Reddit posts
              </p>
            </div>
          </Button>
          
          <Button 
            onClick={() => onSelectSource("fine-tune")}
            variant="outline" 
            className="flex items-center justify-start gap-3 p-6 h-auto hover:border-primary/50 dark:hover:border-primary/40 hover:bg-primary/5 dark:hover:bg-primary/10 transition-all"
          >
            <div className="bg-primary/10 dark:bg-primary/20 p-2 rounded-full">
              <Lightbulb className="h-5 w-5 text-primary dark:text-primary/90" />
            </div>
            <div className="text-left">
              <h3 className="font-medium text-base">AI Generation</h3>
              <p className="text-sm text-muted-foreground">
                Use our fine-tuned AI model to create a unique story idea
              </p>
            </div>
          </Button>
          
          <div className="relative my-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>
          
          <Button 
            onClick={() => onSelectSource("custom")}
            variant="outline" 
            className="flex items-center justify-start gap-3 p-4 h-auto hover:border-green-200 dark:hover:border-green-800 hover:bg-green-50/50 dark:hover:bg-green-900/10 transition-all"
          >
            <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-full">
              <PenTool className="h-4 w-4 text-green-500 dark:text-green-400" />
            </div>
            <div className="text-left">
              <h3 className="font-medium text-sm">Write Your Own</h3>
              <p className="text-xs text-muted-foreground">
                Enter your own story idea
              </p>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 