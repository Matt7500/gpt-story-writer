import { ScrollArea } from '@/components/ui/scroll-area';
import { Layer } from '@/types/editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  EyeIcon, 
  EyeOffIcon, 
  Trash, 
  ChevronUp, 
  ChevronDown,
  Edit,
  Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface LayerPanelProps {
  layers: Layer[];
  activeLayerId: string | null;
  onLayerClick: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onLayerNameChange: (layerId: string, name: string) => void;
  onMoveLayer: (layerId: string, direction: 'up' | 'down') => void;
}

export function LayerPanel({
  layers,
  activeLayerId,
  onLayerClick,
  onToggleVisibility,
  onDeleteLayer,
  onLayerNameChange,
  onMoveLayer
}: LayerPanelProps) {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  
  const startEditing = (layer: Layer) => {
    setEditingLayerId(layer.id);
    setEditName(layer.name);
  };
  
  const saveLayerName = () => {
    if (editingLayerId) {
      onLayerNameChange(editingLayerId, editName);
    }
    setEditingLayerId(null);
  };
  
  // Sort layers by z-index in descending order (top layer first)
  const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  
  return (
    <div className="h-full flex flex-col">
      <div className="font-medium flex items-center justify-between mb-4 p-2 border-b">
        <div className="flex items-center">
          <Layers className="w-4 h-4 mr-2" />
          <span>Layers</span>
        </div>
        <div className="text-xs text-gray-500">
          {layers.length} {layers.length === 1 ? 'layer' : 'layers'}
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-1">
          {sortedLayers.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-6">
              No layers yet. Add text or images to get started.
            </div>
          ) : (
            sortedLayers.map(layer => (
              <div 
                key={layer.id}
                className={cn(
                  "p-2 rounded cursor-pointer group flex items-center justify-between",
                  layer.id === activeLayerId 
                    ? "bg-primary/10" 
                    : "hover:bg-accent"
                )}
                onClick={() => onLayerClick(layer.id)}
              >
                <div className="flex items-center overflow-hidden">
                  <button 
                    className="mr-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility(layer.id);
                    }}
                  >
                    {layer.visible ? 
                      <EyeIcon className="w-4 h-4" /> : 
                      <EyeOffIcon className="w-4 h-4" />
                    }
                  </button>
                  
                  {editingLayerId === layer.id ? (
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveLayerName();
                      }}
                      className="flex-1"
                    >
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-6 py-0 px-1 text-sm"
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        onBlur={saveLayerName}
                      />
                    </form>
                  ) : (
                    <div className="flex items-center overflow-hidden">
                      <span className="text-sm truncate flex-1">
                        {layer.name}
                      </span>
                      <button
                        className="ml-2 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-900"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(layer);
                        }}
                      >
                        <Edit className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center space-x-1">
                  <button
                    className="text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayer(layer.id, 'up');
                    }}
                    disabled={layer.zIndex === layers.length - 1}
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  
                  <button
                    className="text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayer(layer.id, 'down');
                    }}
                    disabled={layer.zIndex === 0}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  
                  <button
                    className="text-red-500 hover:text-red-700 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLayer(layer.id);
                    }}
                  >
                    <Trash className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
} 