import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ExportOptions } from '@/types/editor';

interface ExportImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
  previewUrl: string;
}

export function ExportImageModal({
  isOpen,
  onClose,
  onExport,
  previewUrl
}: ExportImageModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'png',
    quality: 1.0,
    scale: 1.0,
    fileName: 'thumbnail'
  });
  
  const handleExport = () => {
    onExport(options);
    onClose();
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Image</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="flex justify-center mb-4">
            <div className="border rounded p-1 max-w-xs max-h-48 overflow-hidden">
              <img 
                src={previewUrl} 
                alt="Preview" 
                className="object-contain max-w-full max-h-full"
              />
            </div>
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="fileName">File Name</Label>
            <Input
              id="fileName"
              value={options.fileName}
              onChange={(e) => setOptions({ ...options, fileName: e.target.value })}
            />
          </div>
          
          <div className="grid gap-2">
            <Label>Format</Label>
            <RadioGroup
              value={options.format}
              onValueChange={(value) => setOptions({ 
                ...options, 
                format: value as 'png' | 'jpeg' 
              })}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="png" id="png" />
                <Label htmlFor="png">PNG</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="jpeg" id="jpeg" />
                <Label htmlFor="jpeg">JPEG</Label>
              </div>
            </RadioGroup>
          </div>
          
          {options.format === 'jpeg' && (
            <div className="grid gap-2">
              <div className="flex justify-between">
                <Label htmlFor="quality">Quality</Label>
                <span>{Math.round(options.quality * 100)}%</span>
              </div>
              <Slider
                id="quality"
                value={[options.quality * 100]}
                min={1}
                max={100}
                step={1}
                onValueChange={(value) => setOptions({ 
                  ...options, 
                  quality: value[0] / 100 
                })}
              />
            </div>
          )}
          
          <div className="grid gap-2">
            <div className="flex justify-between">
              <Label htmlFor="scale">Scale</Label>
              <span>{options.scale}x</span>
            </div>
            <Slider
              id="scale"
              value={[options.scale * 100]}
              min={10}
              max={300}
              step={10}
              onValueChange={(value) => setOptions({ 
                ...options, 
                scale: value[0] / 100 
              })}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 