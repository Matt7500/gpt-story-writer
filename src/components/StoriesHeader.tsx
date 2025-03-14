import { Button } from "@/components/ui/button";
import { Plus, LogOut, Settings, Image } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface StoriesHeaderProps {
  onCreateStory: () => void;
  onSignOut: () => void;
}

export function StoriesHeader({ onCreateStory, onSignOut }: StoriesHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 w-full">
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
            variant="outline"
            onClick={() => navigate('/image-editor')}
            className="gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <Image className="h-4 w-4" />
            Thumbnail Editor
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/settings')}
            className="gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
          <Button 
            variant="outline" 
            onClick={onSignOut}
            className="gap-2 bg-gray-100 hover:bg-gray-200 hover:bg-red-100 hover:text-red-600 hover:border-red-300 dark:bg-gray-800 dark:hover:bg-red-900/30 dark:hover:text-red-400 dark:hover:border-red-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
}
