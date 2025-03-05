import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

interface Character {
  name: string;
  description: string;
}

interface CharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
}

export function CharacterModal({
  isOpen,
  onClose,
  characters,
}: CharacterModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Characters</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] mt-4 pr-4 -mr-4">
          <div className="space-y-6 pr-2">
            {characters.map((character, index) => (
              <div key={index} className="space-y-2">
                <h3 className="font-semibold text-lg">{character.name}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {character.description}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
