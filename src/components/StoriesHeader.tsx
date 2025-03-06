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
    <header className="sticky top-0 z-50 w-full">
      <div className="w-full px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Story Writer</h1>
        <div className="flex items-center gap-4">
          <Button onClick={onCreateStory} className="gap-2">
            <Plus className="h-4 w-4" />
            New Story
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/settings')}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
          <Button 
            variant="outline" 
            onClick={onSignOut}
            className="gap-2 text-[#ea384c] dark:text-red-400 hover:text-[#ea384c] dark:hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
}
