import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Layer, ImageLayerData } from '@/types/editor';
import { Switch } from '@/components/ui/switch';
import { FlipHorizontal } from 'lucide-react';

interface ImageEditorPanelProps {
  layer: Layer;
  onUpdate: (updatedLayer: Layer) => void;
}

export function ImageEditorPanel({ layer, onUpdate }: ImageEditorPanelProps) {
  if (layer.type !== 'image') return null;
  
  const handleFlip = () => {
    onUpdate({
      ...layer,
      flipped: !layer.flipped
    });
  };
  
  const handleRotate = (degrees: number) => {
    const newRotation = (layer.rotation + degrees) % 360;
    onUpdate({
      ...layer,
      rotation: newRotation
    });
  };
  
  return (
    <div className="space-y-4 py-2">
      <div className="grid gap-2">
        <Label>Preview</Label>
        <div className="border rounded p-2 flex justify-center">
          <div className="relative overflow-hidden" style={{ maxWidth: '200px', maxHeight: '150px' }}>
            <img 
              src={(layer.data as ImageLayerData).src} 
              alt="Layer Preview" 
              className="object-contain max-w-full max-h-full"
              style={{ 
                transform: `${layer.flipped ? 'scaleX(-1)' : ''} rotate(${layer.rotation}deg)` 
              }}
            />
          </div>
        </div>
      </div>
      
      <div className="grid gap-2">
        <Label>Transform</Label>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleFlip}>
            <FlipHorizontal className="w-4 h-4 mr-2" />
            Flip
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleRotate(-90)}>
            Rotate Left
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleRotate(90)}>
            Rotate Right
          </Button>
        </div>
      </div>
      
      <div className="grid gap-2">
        <div className="flex justify-between">
          <Label htmlFor="rotation">Rotation</Label>
          <span>{layer.rotation}°</span>
        </div>
        <Slider
          id="rotation"
          value={[layer.rotation]}
          min={0}
          max={359}
          step={1}
          onValueChange={(value) => {
            onUpdate({
              ...layer,
              rotation: value[0]
            });
          }}
        />
      </div>
      
      <div className="grid gap-2">
        <div className="flex justify-between">
          <Label htmlFor="opacity">Opacity</Label>
          <span>{((layer.opacity || 1) * 100).toFixed(0)}%</span>
        </div>
        <Slider
          id="opacity"
          value={[(layer.opacity || 1) * 100]}
          min={0}
          max={100}
          step={1}
          onValueChange={(value) => {
            onUpdate({
              ...layer,
              opacity: value[0] / 100
            });
          }}
        />
      </div>
      
      <div className="border-t pt-4">
        <div className="mt-4">
          <Button 
            size="sm" 
            variant="outline" 
            className="w-full" 
            onClick={() => {
              /* In a real app, this could open a file dialog to replace the image */
              const fileInput = document.createElement('input');
              fileInput.type = 'file';
              fileInput.accept = 'image/png,image/jpeg';
              fileInput.onchange = (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (!files || files.length === 0) return;
                
                const file = files[0];
                const reader = new FileReader();
                
                reader.onload = (event) => {
                  if (!event.target?.result) return;
                  
                  const img = new Image();
                  img.src = event.target.result as string;
                  
                  img.onload = () => {
                    // Calculate new dimensions while maintaining aspect ratio
                    const aspectRatio = img.width / img.height;
                    const currentWidth = layer.width || 0;
                    const currentHeight = layer.height || 0;
                    
                    // Use current dimensions as a reference for the new image
                    let newWidth = currentWidth;
                    let newHeight = currentHeight;
                    
                    if (currentWidth && currentHeight) {
                      // If both dimensions exist, maintain the same size
                      newWidth = currentWidth;
                      newHeight = currentHeight;
                    } else {
                      // Default dimensions if none exist
                      newWidth = img.width;
                      newHeight = img.height;
                    }
                    
                    onUpdate({
                      ...layer,
                      data: {
                        ...layer.data,
                        src: event.target.result as string
                      },
                      width: newWidth,
                      height: newHeight
                    });
                  };
                };
                
                reader.readAsDataURL(file);
              };
              fileInput.click();
            }}
          >
            Replace Image
          </Button>
        </div>
      </div>
    </div>
  );
} 