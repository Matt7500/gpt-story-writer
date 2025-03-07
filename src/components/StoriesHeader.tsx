import { Button } from "@/components/ui/button";
import { Plus, LogOut, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface StoriesHeaderProps {
  onCreateStory: () => void;
  onSignOut: () => void;
}

export function StoriesHeader({ onCreateStory, onSignOut }: StoriesHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-sm bg-background/80 border-b border-border/40">
      <div className="w-full px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Story Writer</h1>
        <div className="flex items-center gap-3">
          <Button 
            onClick={onCreateStory} 
            className="gap-2 bg-primary hover:bg-primary/90 dark:bg-primary/90 dark:hover:bg-primary/80 text-white shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Story
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate('/settings')}
            className="gap-2 hover:bg-secondary"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
          <Button 
            variant="ghost" 
            onClick={onSignOut}
            className="gap-2 transition-colors hover:bg-red-100 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
}
