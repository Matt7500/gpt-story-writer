import { useState, useEffect } from 'react';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from '@/components/ui/select';
import { Font } from '@/types/editor';

// Default system fonts
const SYSTEM_FONTS: Font[] = [
  { name: 'Arial', family: 'Arial, sans-serif', isSystem: true },
  { name: 'Verdana', family: 'Verdana, sans-serif', isSystem: true },
  { name: 'Helvetica', family: 'Helvetica, sans-serif', isSystem: true },
  { name: 'Times New Roman', family: "'Times New Roman', serif", isSystem: true },
  { name: 'Georgia', family: 'Georgia, serif', isSystem: true },
  { name: 'Courier New', family: "'Courier New', monospace", isSystem: true },
  { name: 'Impact', family: 'Impact, sans-serif', isSystem: true },
  { name: 'Comic Sans MS', family: "'Comic Sans MS', cursive", isSystem: true },
];

interface FontSelectProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function FontSelect({ value, onValueChange }: FontSelectProps) {
  const [fonts, setFonts] = useState<Font[]>(SYSTEM_FONTS);
  
  // In a real implementation, this would load fonts from user settings
  const loadUserFonts = async () => {
    // This would fetch fonts from a database or settings
    // For now, we'll just use system fonts
    setFonts(SYSTEM_FONTS);
  };
  
  useEffect(() => {
    loadUserFonts();
  }, []);
  
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select font" />
      </SelectTrigger>
      <SelectContent>
        <div className="font-list max-h-[300px] overflow-y-auto">
          {fonts.map((font) => (
            <SelectItem 
              key={font.name} 
              value={font.family}
              style={{ fontFamily: font.family }}
            >
              {font.name}
            </SelectItem>
          ))}
        </div>
      </SelectContent>
    </Select>
  );
} 