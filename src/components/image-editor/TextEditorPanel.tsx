import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Layer, TextLayerData } from '@/types/editor';
import { Switch } from '@/components/ui/switch';
import { useEffect, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { FontSelect } from './FontSelect';

interface TextEditorPanelProps {
  layer: Layer;
  onUpdate: (updatedLayer: Layer) => void;
}

export function TextEditorPanel({ layer, onUpdate }: TextEditorPanelProps) {
  if (layer.type !== 'text') return null;
  
  const textData = layer.data as TextLayerData;
  
  const [text, setText] = useState(textData.text);
  const [fontSize, setFontSize] = useState(textData.fontSize);
  const [fontFamily, setFontFamily] = useState(textData.fontFamily);
  const [color, setColor] = useState(textData.color);
  const [letterSpacing, setLetterSpacing] = useState(textData.letterSpacing);
  const [lineHeight, setLineHeight] = useState(textData.lineHeight);
  const [strokeEnabled, setStrokeEnabled] = useState(textData.stroke.enabled);
  const [strokeWidth, setStrokeWidth] = useState(textData.stroke.width);
  const [strokeColor, setStrokeColor] = useState(textData.stroke.color);
  
  // Update local state when layer prop changes
  useEffect(() => {
    if (layer.type === 'text') {
      const textData = layer.data as TextLayerData;
      setText(textData.text);
      setFontSize(textData.fontSize);
      setFontFamily(textData.fontFamily);
      setColor(textData.color);
      setLetterSpacing(textData.letterSpacing);
      setLineHeight(textData.lineHeight);
      setStrokeEnabled(textData.stroke.enabled);
      setStrokeWidth(textData.stroke.width);
      setStrokeColor(textData.stroke.color);
    }
  }, [layer]);
  
  const updateTextData = () => {
    const updatedLayer: Layer = {
      ...layer,
      data: {
        ...textData,
        text,
        fontSize,
        fontFamily,
        color,
        letterSpacing,
        lineHeight,
        stroke: {
          enabled: strokeEnabled,
          width: strokeWidth,
          color: strokeColor
        }
      }
    };
    
    onUpdate(updatedLayer);
  };
  
  return (
    <div className="space-y-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="text-content">Text Content</Label>
        <Textarea
          id="text-content"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            updateTextData();
          }}
          rows={3}
        />
      </div>
      
      <div className="grid gap-2">
        <Label htmlFor="font-family">Font</Label>
        <FontSelect 
          value={fontFamily} 
          onValueChange={(value) => {
            setFontFamily(value);
            updateTextData();
          }} 
        />
      </div>
      
      <div className="grid gap-2">
        <div className="flex justify-between">
          <Label htmlFor="font-size">Font Size</Label>
          <span>{fontSize}px</span>
        </div>
        <Slider
          id="font-size"
          value={[fontSize]}
          min={8}
          max={200}
          step={1}
          onValueChange={(value) => {
            setFontSize(value[0]);
            updateTextData();
          }}
        />
      </div>
      
      <div className="grid gap-2">
        <Label htmlFor="text-color">Text Color</Label>
        <div className="flex gap-2">
          <div 
            className="w-8 h-8 rounded border" 
            style={{ backgroundColor: color }}
          />
          <Input
            id="text-color"
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              updateTextData();
            }}
          />
        </div>
      </div>
      
      <div className="grid gap-2">
        <div className="flex justify-between">
          <Label htmlFor="letter-spacing">Letter Spacing</Label>
          <span>{letterSpacing.toFixed(1)}px</span>
        </div>
        <Slider
          id="letter-spacing"
          value={[letterSpacing]}
          min={-5}
          max={20}
          step={0.1}
          onValueChange={(value) => {
            setLetterSpacing(value[0]);
            updateTextData();
          }}
        />
      </div>
      
      <div className="grid gap-2">
        <div className="flex justify-between">
          <Label htmlFor="line-height">Line Height</Label>
          <span>{lineHeight.toFixed(1)}</span>
        </div>
        <Slider
          id="line-height"
          value={[lineHeight]}
          min={0.5}
          max={3}
          step={0.1}
          onValueChange={(value) => {
            setLineHeight(value[0]);
            updateTextData();
          }}
        />
      </div>
      
      <div className="border-t pt-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="stroke-enabled">Text Stroke</Label>
          <Switch
            id="stroke-enabled"
            checked={strokeEnabled}
            onCheckedChange={(value) => {
              setStrokeEnabled(value);
              updateTextData();
            }}
          />
        </div>
        
        {strokeEnabled && (
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <div className="flex justify-between">
                <Label htmlFor="stroke-width">Stroke Width</Label>
                <span>{strokeWidth}px</span>
              </div>
              <Slider
                id="stroke-width"
                value={[strokeWidth]}
                min={1}
                max={20}
                step={1}
                onValueChange={(value) => {
                  setStrokeWidth(value[0]);
                  updateTextData();
                }}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="stroke-color">Stroke Color</Label>
              <div className="flex gap-2">
                <div 
                  className="w-8 h-8 rounded border" 
                  style={{ backgroundColor: strokeColor }}
                />
                <Input
                  id="stroke-color"
                  type="color"
                  value={strokeColor}
                  onChange={(e) => {
                    setStrokeColor(e.target.value);
                    updateTextData();
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 