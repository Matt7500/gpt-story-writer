import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { User, Calendar, Tag, MessageSquareQuote } from "lucide-react";

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
      <DialogContent className="sm:max-w-[750px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Characters</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[70vh] pr-4 -mr-4">
          <div className="space-y-4 pr-2">
            {characters.map((character, index) => {
              // Extract metadata from description
              const lines = character.description.split('\n');
              const metadata: Record<string, string> = {};
              let currentSection = '';
              const sections: Record<string, string[]> = {};
              
              // Process the description to extract metadata and sections
              lines.forEach(line => {
                const trimmedLine = line.trim();
                
                // Check for metadata (Aliases, Pronouns, Age)
                if (trimmedLine.startsWith('Aliases:')) {
                  metadata['aliases'] = trimmedLine.substring('Aliases:'.length).trim();
                } else if (trimmedLine.startsWith('Pronouns:')) {
                  metadata['pronouns'] = trimmedLine.substring('Pronouns:'.length).trim();
                } else if (trimmedLine.startsWith('Age:')) {
                  metadata['age'] = trimmedLine.substring('Age:'.length).trim();
                } 
                // Check for section headers
                else if (trimmedLine.endsWith(':')) {
                  currentSection = trimmedLine.substring(0, trimmedLine.length - 1).trim();
                  sections[currentSection] = [];
                } 
                // Add content to current section
                else if (currentSection && trimmedLine) {
                  if (!sections[currentSection]) {
                    sections[currentSection] = [];
                  }
                  sections[currentSection].push(trimmedLine);
                }
              });
              
              // Generate a unique color for this character
              const characterColor = generateCharacterColor(character.name);
              
              return (
                <div key={index} className="p-6 rounded-lg bg-muted">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4">
                      <div 
                        className="h-10 w-10 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: characterColor }}
                      >
                        <User className="h-5 w-5" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-semibold text-lg">{character.name}</h3>
                        
                        {/* Character attributes */}
                        <div className="flex flex-wrap gap-3">
                          {metadata.age && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>{metadata.age} years</span>
                            </div>
                          )}
                          {metadata.pronouns && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <MessageSquareQuote className="h-3.5 w-3.5" />
                              <span>{metadata.pronouns}</span>
                            </div>
                          )}
                          {metadata.aliases && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Tag className="h-3.5 w-3.5" />
                              <span>{metadata.aliases}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pl-14 space-y-4 mt-5">
                    {Object.entries(sections).map(([sectionName, sectionContent], sectionIndex) => (
                      <div key={sectionIndex} className="border-l-2 pl-4" style={{ borderColor: `${characterColor}40` }}>
                        <h4 className="text-sm font-medium mb-2" style={{ color: characterColor }}>
                          {sectionName}
                        </h4>
                        <div className="text-sm text-muted-foreground space-y-2">
                          {sectionContent.map((paragraph, paraIndex) => (
                            <p key={paraIndex} className="leading-relaxed">
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Function to generate a consistent color based on character name
function generateCharacterColor(name: string): string {
  // Simple hash function to generate a number from a string
  const hash = name.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  
  // List of pleasing colors for character avatars
  const colors = [
    '#4f46e5', // indigo
    '#0891b2', // cyan
    '#7c3aed', // violet
    '#2563eb', // blue
    '#db2777', // pink
    '#ea580c', // orange
    '#059669', // emerald
    '#9333ea', // purple
    '#16a34a', // green
    '#ca8a04', // yellow
    '#dc2626', // red
    '#475569', // slate
  ];
  
  // Use the hash to select a color
  return colors[Math.abs(hash) % colors.length];
}
