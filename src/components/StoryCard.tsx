
import { Book, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Story } from "@/types/story";

interface StoryCardProps {
  story: Story;
  onDelete: (story: Story) => void;
}

export function StoryCard({ story, onDelete }: StoryCardProps) {
  const navigate = useNavigate();

  return (
    <div className="p-6 border rounded-lg hover:bg-accent/50 transition-colors group relative">
      <div 
        className="cursor-pointer"
        onClick={() => navigate(`/editor/${story.id}`)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Book className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">{story.title}</h3>
              <p className="text-sm text-muted-foreground">
                {new Date(story.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
          {story.story_idea}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 hover:bg-red-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(story);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
