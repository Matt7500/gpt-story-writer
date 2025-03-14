import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Layers, 
  Image as ImageIcon, 
  Type, 
  Move, 
  Download, 
  Plus, 
  Trash, 
  EyeIcon, 
  EyeOffIcon,
  FlipHorizontal,
  CornerDownRight
} from 'lucide-react';

import { TextEditorPanel } from '@/components/image-editor/TextEditorPanel';
import { ImageEditorPanel } from '@/components/image-editor/ImageEditorPanel';
import { LayerPanel } from '@/components/image-editor/LayerPanel';
import { ExportImageModal } from '@/components/image-editor/ExportImageModal';

import { 
  Layer, 
  EditorState, 
  DragState, 
  SnapResult, 
  ExportOptions 
} from '@/types/editor';

import { 
  isPointInLayer, 
  drawSelectionBox, 
  drawSnapLines, 
  calculateSnapPosition, 
  drawDistanceIndicators,
  scalePoint
} from '@/utils/canvasUtils';

import {
  renderImageLayer,
  renderTextLayer,
  calculateTextDimensions,
  loadImage,
  exportCanvasToImage,
  downloadImage
} from '@/utils/renderUtils';

// Types for our editor
interface Layer {
  id: string;
  type: 'image' | 'text';
  name: string;
  visible: boolean;
  zIndex: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation: number;
  flipped: boolean;
  opacity: number;
  data: ImageLayerData | TextLayerData;
}

interface ImageLayerData {
  src: string;
}

interface TextLayerData {
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  letterSpacing: number;
  lineHeight: number;
  stroke: {
    enabled: boolean;
    width: number;
    color: string;
  };
}

// Define resize handle types and positions
type ResizeHandlePosition = 
  'top-left' | 'top' | 'top-right' | 
  'left' | 'right' | 
  'bottom-left' | 'bottom' | 'bottom-right';

interface ResizeState {
  isResizing: boolean;
  handlePosition: ResizeHandlePosition | null;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  preserveAspectRatio: boolean;
  aspectRatio: number;
}

const ImageEditor = () => {
  // Canvas setup
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [editorState, setEditorState] = useState<EditorState>({
    canvasWidth: 1920,
    canvasHeight: 1080,
    layers: [],
    activeLayerId: null,
    scale: 1,
    showSnapLines: true,
    showDistanceIndicators: false,
    dragMode: false
  });
  
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    layerStartX: 0,
    layerStartY: 0,
    snapResult: null
  });
  
  const [imageCache] = useState<Map<string, HTMLImageElement>>(new Map());
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [exportPreviewUrl, setExportPreviewUrl] = useState<string>('');
  const [isCtrlPressed, setIsCtrlPressed] = useState<boolean>(false);
  
  // Add resize state
  const [resizeState, setResizeState] = useState<ResizeState>({
    isResizing: false,
    handlePosition: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    preserveAspectRatio: false,
    aspectRatio: 1
  });
  
  // Initialize offscreen canvas for rendering
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = editorState.canvasWidth;
    canvas.height = editorState.canvasHeight;
    offscreenCanvasRef.current = canvas;
  }, []);
  
  // Calculate the scale to fit the canvas within the container
  useEffect(() => {
    const resizeCanvas = () => {
      if (!containerRef.current || !canvasRef.current) return;
      
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      // Calculate scale to fit 16:9 ratio in the container
      const scaleWidth = containerWidth / editorState.canvasWidth;
      const scaleHeight = containerHeight / editorState.canvasHeight;
      const scale = Math.min(scaleWidth, scaleHeight, 1); // Don't scale up beyond original size
      
      setEditorState(prev => ({
        ...prev,
        scale
      }));
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [editorState.canvasWidth, editorState.canvasHeight]);
  
  // Key event listeners for ctrl/cmd key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlPressed(true);
        setEditorState(prev => ({
          ...prev,
          showDistanceIndicators: true
        }));
      }
      
      // Update resize state if shift is pressed during resize
      if (e.key === 'Shift' && resizeState.isResizing) {
        setResizeState(prev => ({
          ...prev,
          preserveAspectRatio: true
        }));
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlPressed(false);
        setEditorState(prev => ({
          ...prev,
          showDistanceIndicators: false
        }));
      }
      
      // Update resize state if shift is released during resize
      if (e.key === 'Shift' && resizeState.isResizing) {
        setResizeState(prev => ({
          ...prev,
          preserveAspectRatio: false
        }));
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [resizeState.isResizing]);
  
  // Render the canvas contents
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background (white)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Sort layers by z-index
    const sortedLayers = [...editorState.layers].sort((a, b) => a.zIndex - b.zIndex);
    
    // Render visible layers
    for (const layer of sortedLayers) {
      if (!layer.visible) continue;
      
      if (layer.type === 'image') {
        renderImageLayer(ctx, layer, imageCache);
      } else if (layer.type === 'text') {
        renderTextLayer(ctx, layer);
      }
    }
    
    // Draw selection box for active layer
    if (editorState.activeLayerId) {
      const activeLayer = editorState.layers.find(layer => layer.id === editorState.activeLayerId);
      if (activeLayer) {
        drawSelectionBox(ctx, activeLayer);
        drawResizeHandles(ctx, activeLayer);
        
        // Draw distance indicators if ctrl/cmd is pressed
        if (editorState.showDistanceIndicators) {
          drawDistanceIndicators(
            ctx, 
            activeLayer, 
            editorState.canvasWidth, 
            editorState.canvasHeight
          );
        }
      }
    }
    
    // Draw snap lines if snapping is active
    if (dragState.snapResult && editorState.showSnapLines) {
      drawSnapLines(
        ctx, 
        dragState.snapResult, 
        editorState.canvasWidth, 
        editorState.canvasHeight
      );
    }
  }, [editorState, dragState, imageCache]);
  
  // Update canvas when state changes
  useEffect(() => {
    renderCanvas();
  }, [editorState, dragState, renderCanvas]);
  
  // Handle mouse events for dragging layers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = scalePoint(e.clientX - rect.left, editorState.scale);
    const y = scalePoint(e.clientY - rect.top, editorState.scale);
    
    // Check if the mouse is on a resize handle of the active layer
    if (editorState.activeLayerId) {
      const activeLayer = editorState.layers.find(layer => layer.id === editorState.activeLayerId);
      
      if (activeLayer && activeLayer.width && activeLayer.height) {
        const handlePositions: ResizeHandlePosition[] = [
          'top-left', 'top', 'top-right', 
          'left', 'right', 
          'bottom-left', 'bottom', 'bottom-right'
        ];
        
        for (const position of handlePositions) {
          if (isPointInResizeHandle(x, y, activeLayer, position)) {
            // Start resizing
            setResizeState({
              isResizing: true,
              handlePosition: position,
              startX: x,
              startY: y,
              startWidth: activeLayer.width,
              startHeight: activeLayer.height,
              preserveAspectRatio: e.shiftKey, // Shift key to preserve aspect ratio
              aspectRatio: activeLayer.width / activeLayer.height
            });
            return;
          }
        }
      }
    }
    
    // If not on a resize handle, proceed with the regular mouse down handling
    // Check if click is on a layer
    for (const layer of [...editorState.layers].reverse()) {
      if (isPointInLayer(x, y, layer)) {
        // Select the layer if not already active
        if (layer.id !== editorState.activeLayerId) {
          setEditorState(prev => ({
            ...prev,
            activeLayerId: layer.id
          }));
        }
        
        // Start drag if in drag mode
        if (editorState.dragMode) {
          setDragState({
            isDragging: true,
            startX: x,
            startY: y,
            layerStartX: layer.x,
            layerStartY: layer.y,
            snapResult: null
          });
        }
        
        return;
      }
    }
    
    // Click on empty canvas - deselect active layer
    setEditorState(prev => ({
      ...prev,
      activeLayerId: null
    }));
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = scalePoint(e.clientX - rect.left, editorState.scale);
    const y = scalePoint(e.clientY - rect.top, editorState.scale);
    
    // Handle resize operations
    if (resizeState.isResizing && editorState.activeLayerId) {
      e.preventDefault();
      
      const activeLayer = editorState.layers.find(layer => layer.id === editorState.activeLayerId);
      if (!activeLayer || !activeLayer.width || !activeLayer.height) return;
      
      const dx = x - resizeState.startX;
      const dy = y - resizeState.startY;
      
      let newWidth = resizeState.startWidth;
      let newHeight = resizeState.startHeight;
      let newX = activeLayer.x;
      let newY = activeLayer.y;
      
      // Update dimensions based on handle position
      switch (resizeState.handlePosition) {
        case 'top-left':
          newWidth = resizeState.startWidth - dx;
          newHeight = resizeState.startHeight - dy;
          newX = activeLayer.x + dx;
          newY = activeLayer.y + dy;
          break;
        case 'top':
          newHeight = resizeState.startHeight - dy;
          newY = activeLayer.y + dy;
          break;
        case 'top-right':
          newWidth = resizeState.startWidth + dx;
          newHeight = resizeState.startHeight - dy;
          newY = activeLayer.y + dy;
          break;
        case 'left':
          newWidth = resizeState.startWidth - dx;
          newX = activeLayer.x + dx;
          break;
        case 'right':
          newWidth = resizeState.startWidth + dx;
          break;
        case 'bottom-left':
          newWidth = resizeState.startWidth - dx;
          newHeight = resizeState.startHeight + dy;
          newX = activeLayer.x + dx;
          break;
        case 'bottom':
          newHeight = resizeState.startHeight + dy;
          break;
        case 'bottom-right':
          newWidth = resizeState.startWidth + dx;
          newHeight = resizeState.startHeight + dy;
          break;
      }
      
      // Ensure minimum size
      newWidth = Math.max(10, newWidth);
      newHeight = Math.max(10, newHeight);
      
      // Preserve aspect ratio if shift key is pressed or preserveAspectRatio is true
      if (resizeState.preserveAspectRatio || e.shiftKey) {
        const aspectRatio = resizeState.aspectRatio;
        
        // Determine which dimension should be adjusted to maintain ratio
        if (['left', 'right'].includes(resizeState.handlePosition || '')) {
          // Only width is changing
          newHeight = newWidth / aspectRatio;
        } else if (['top', 'bottom'].includes(resizeState.handlePosition || '')) {
          // Only height is changing
          newWidth = newHeight * aspectRatio;
        } else {
          // Both dimensions are changing
          // Determine which dimension changed more
          const widthChange = Math.abs(newWidth - resizeState.startWidth);
          const heightChange = Math.abs(newHeight - resizeState.startHeight);
          
          if (widthChange >= heightChange) {
            newHeight = newWidth / aspectRatio;
          } else {
            newWidth = newHeight * aspectRatio;
          }
        }
      }
      
      // Update layer position and dimensions
      setEditorState(prev => ({
        ...prev,
        layers: prev.layers.map(layer => 
          layer.id === editorState.activeLayerId
            ? { 
                ...layer, 
                x: newX, 
                y: newY, 
                width: newWidth, 
                height: newHeight 
              }
            : layer
        )
      }));
      
      // Update text metrics for text layers after resize
      if (activeLayer.type === 'text' && canvasRef.current) {
        const updatedLayer = {
          ...activeLayer,
          width: newWidth,
          height: newHeight
        };
        
        // Adjust font size proportionally for text layers
        if (activeLayer.data && 'fontSize' in activeLayer.data) {
          const textData = activeLayer.data as TextLayerData;
          const scale = newWidth / resizeState.startWidth;
          const newFontSize = Math.max(8, Math.round(textData.fontSize * scale));
          
          // Update text layer with new font size
          setEditorState(prev => ({
            ...prev,
            layers: prev.layers.map(layer => 
              layer.id === editorState.activeLayerId
                ? { 
                    ...layer, 
                    data: {
                      ...layer.data,
                      fontSize: newFontSize
                    }
                  }
                : layer
            )
          }));
        }
      }
      
      return;
    }
    
    // Handle regular dragging
    if (dragState.isDragging && editorState.activeLayerId) {
      const dx = x - dragState.startX;
      const dy = y - dragState.startY;
      
      const newX = dragState.layerStartX + dx;
      const newY = dragState.layerStartY + dy;
      
      const activeLayer = editorState.layers.find(layer => layer.id === editorState.activeLayerId);
      if (!activeLayer) return;
      
      // Calculate snap position if snap is enabled
      if (editorState.showSnapLines) {
        const snapResult = calculateSnapPosition(
          activeLayer,
          editorState.layers,
          editorState.canvasWidth,
          editorState.canvasHeight,
          newX,
          newY
        );
        
        setDragState(prev => ({
          ...prev,
          snapResult
        }));
        
        // Update layer position with snap
        setEditorState(prev => ({
          ...prev,
          layers: prev.layers.map(layer => 
            layer.id === editorState.activeLayerId
              ? { ...layer, x: snapResult.x, y: snapResult.y }
              : layer
          )
        }));
      } else {
        // Update layer position without snap
        setEditorState(prev => ({
          ...prev,
          layers: prev.layers.map(layer => 
            layer.id === editorState.activeLayerId
              ? { ...layer, x: newX, y: newY }
              : layer
          )
        }));
      }
    }
    
    // Update cursor based on hover over resize handles
    if (editorState.activeLayerId && !dragState.isDragging && !resizeState.isResizing) {
      const activeLayer = editorState.layers.find(layer => layer.id === editorState.activeLayerId);
      
      if (activeLayer && activeLayer.width && activeLayer.height) {
        const handlePositions: ResizeHandlePosition[] = [
          'top-left', 'top', 'top-right', 
          'left', 'right', 
          'bottom-left', 'bottom', 'bottom-right'
        ];
        
        for (const position of handlePositions) {
          if (isPointInResizeHandle(x, y, activeLayer, position)) {
            // Set cursor style based on handle position
            const canvas = canvasRef.current;
            if (canvas) {
              canvas.style.cursor = getResizeCursor(position);
            }
            return;
          }
        }
        
        // Reset cursor if not over any handle
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.style.cursor = editorState.dragMode ? 'move' : 'default';
        }
      }
    }
  };
  
  const handleMouseUp = () => {
    // Reset resize state
    if (resizeState.isResizing) {
      setResizeState({
        isResizing: false,
        handlePosition: null,
        startX: 0,
        startY: 0,
        startWidth: 0,
        startHeight: 0,
        preserveAspectRatio: false,
        aspectRatio: 1
      });
    }
    
    // Reset drag state
    setDragState({
      isDragging: false,
      startX: 0,
      startY: 0,
      layerStartX: 0,
      layerStartY: 0,
      snapResult: null
    });
  };
  
  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const reader = new FileReader();
    
    reader.onload = (event) => {
      if (!event.target?.result) return;
      
      const img = new Image();
      img.src = event.target.result as string;
      
      img.onload = () => {
        // Store image in cache
        imageCache.set(img.src, img);
        
        // Calculate dimensions to fit within canvas while maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        
        if (width > editorState.canvasWidth) {
          const ratio = editorState.canvasWidth / width;
          width = editorState.canvasWidth;
          height = height * ratio;
        }
        
        if (height > editorState.canvasHeight) {
          const ratio = editorState.canvasHeight / height;
          height = editorState.canvasHeight;
          width = width * ratio;
        }
        
        // Create a new image layer
        const newLayer: Layer = {
          id: `layer-${Date.now()}`,
          type: 'image',
          name: `Image ${editorState.layers.length + 1}`,
          visible: true,
          zIndex: editorState.layers.length,
          x: (editorState.canvasWidth - width) / 2,
          y: (editorState.canvasHeight - height) / 2,
          width,
          height,
          rotation: 0,
          flipped: false,
          opacity: 1,
          data: {
            src: img.src
          }
        };
        
        setEditorState(prev => ({
          ...prev,
          layers: [...prev.layers, newLayer],
          activeLayerId: newLayer.id
        }));
      };
    };
    
    reader.readAsDataURL(file);
    
    // Reset the input
    e.target.value = '';
  };
  
  // Add a new text layer with default settings
  const addTextLayer = () => {
    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      type: 'text',
      name: `Text ${editorState.layers.length + 1}`,
      visible: true,
      zIndex: editorState.layers.length,
      x: 40, // 40px from left
      y: editorState.canvasHeight / 2 - 100, // centered vertically
      rotation: 0,
      flipped: false,
      opacity: 1,
      data: {
        text: 'Your Text Here',
        fontSize: 72,
        fontFamily: 'Arial, sans-serif',
        color: '#ffffff',
        letterSpacing: 0,
        lineHeight: 1.2,
        stroke: {
          enabled: true,
          width: 4,
          color: '#000000'
        }
      }
    };
    
    // Calculate text dimensions
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const { width, height } = calculateTextDimensions(ctx, newLayer);
        newLayer.width = width;
        newLayer.height = height;
      }
    }
    
    setEditorState(prev => ({
      ...prev,
      layers: [...prev.layers, newLayer],
      activeLayerId: newLayer.id
    }));
  };
  
  // Layer operations
  const handleLayerClick = (layerId: string) => {
    setEditorState(prev => ({
      ...prev,
      activeLayerId: layerId
    }));
  };
  
  const handleToggleVisibility = (layerId: string) => {
    setEditorState(prev => ({
      ...prev,
      layers: prev.layers.map(layer => 
        layer.id === layerId 
          ? { ...layer, visible: !layer.visible } 
          : layer
      )
    }));
  };
  
  const handleDeleteLayer = (layerId: string) => {
    setEditorState(prev => {
      const newLayers = prev.layers.filter(layer => layer.id !== layerId);
      
      // Recalculate z-index for all layers
      newLayers.forEach((layer, index) => {
        layer.zIndex = index;
      });
      
      return {
        ...prev,
        layers: newLayers,
        activeLayerId: prev.activeLayerId === layerId 
          ? (newLayers.length > 0 ? newLayers[0].id : null) 
          : prev.activeLayerId
      };
    });
  };
  
  const handleLayerNameChange = (layerId: string, name: string) => {
    setEditorState(prev => ({
      ...prev,
      layers: prev.layers.map(layer => 
        layer.id === layerId 
          ? { ...layer, name } 
          : layer
      )
    }));
  };
  
  const handleMoveLayer = (layerId: string, direction: 'up' | 'down') => {
    setEditorState(prev => {
      const layers = [...prev.layers];
      const currentIndex = layers.findIndex(layer => layer.id === layerId);
      
      if (currentIndex === -1) return prev;
      
      if (direction === 'up' && currentIndex < layers.length - 1) {
        // Swap z-index with the layer above
        const temp = layers[currentIndex].zIndex;
        layers[currentIndex].zIndex = layers[currentIndex + 1].zIndex;
        layers[currentIndex + 1].zIndex = temp;
      } else if (direction === 'down' && currentIndex > 0) {
        // Swap z-index with the layer below
        const temp = layers[currentIndex].zIndex;
        layers[currentIndex].zIndex = layers[currentIndex - 1].zIndex;
        layers[currentIndex - 1].zIndex = temp;
      }
      
      return {
        ...prev,
        layers
      };
    });
  };
  
  const handleUpdateLayer = (updatedLayer: Layer) => {
    setEditorState(prev => ({
      ...prev,
      layers: prev.layers.map(layer => 
        layer.id === updatedLayer.id 
          ? updatedLayer 
          : layer
      )
    }));
  };
  
  // Toggle drag mode
  const toggleDragMode = () => {
    setEditorState(prev => ({
      ...prev,
      dragMode: !prev.dragMode
    }));
  };
  
  // Toggle snap lines
  const toggleSnapLines = () => {
    setEditorState(prev => ({
      ...prev,
      showSnapLines: !prev.showSnapLines
    }));
  };
  
  // Handle export
  const handleExport = () => {
    // Generate a preview first
    if (canvasRef.current) {
      const previewUrl = exportCanvasToImage(canvasRef.current);
      setExportPreviewUrl(previewUrl);
      setIsExportModalOpen(true);
    }
  };
  
  const handleExportConfirm = (options: ExportOptions) => {
    if (!offscreenCanvasRef.current) return;
    
    // Resize offscreen canvas based on export scale
    const exportWidth = editorState.canvasWidth * options.scale;
    const exportHeight = editorState.canvasHeight * options.scale;
    
    offscreenCanvasRef.current.width = exportWidth;
    offscreenCanvasRef.current.height = exportHeight;
    
    const ctx = offscreenCanvasRef.current.getContext('2d');
    if (!ctx) return;
    
    // Set scale for high resolution export
    ctx.scale(options.scale, options.scale);
    
    // Clear canvas
    ctx.clearRect(0, 0, exportWidth, exportHeight);
    
    // Draw background (white)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, editorState.canvasWidth, editorState.canvasHeight);
    
    // Sort layers by z-index
    const sortedLayers = [...editorState.layers].sort((a, b) => a.zIndex - b.zIndex);
    
    // Render visible layers
    for (const layer of sortedLayers) {
      if (!layer.visible) continue;
      
      if (layer.type === 'image') {
        renderImageLayer(ctx, layer, imageCache);
      } else if (layer.type === 'text') {
        renderTextLayer(ctx, layer);
      }
    }
    
    // Export canvas as image
    const dataUrl = exportCanvasToImage(
      offscreenCanvasRef.current, 
      options.format, 
      options.quality
    );
    
    // Download the image
    downloadImage(dataUrl, `${options.fileName}.${options.format}`);
  };
  
  // Get active layer for editing
  const activeLayer = editorState.activeLayerId 
    ? editorState.layers.find(layer => layer.id === editorState.activeLayerId)
    : null;
  
  // Handle zoom with Ctrl+scroll wheel
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Only handle zoom if Ctrl key is pressed
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault(); // Prevent browser zoom
      
      // Determine zoom direction and calculate new scale
      const delta = e.deltaY < 0 ? 0.1 : -0.1; // Zoom in for negative delta, out for positive
      const newScale = Math.max(0.1, Math.min(3, editorState.scale + delta)); // Limit scale between 0.1 and 3
      
      setEditorState(prev => ({
        ...prev,
        scale: newScale
      }));
    }
  };
  
  // Helper function to check if point is within a resize handle
  const isPointInResizeHandle = (
    x: number, 
    y: number, 
    layer: Layer, 
    handlePosition: ResizeHandlePosition,
    handleSize: number = 10
  ): boolean => {
    if (!layer.width || !layer.height) return false;
    
    const halfHandleSize = handleSize / 2;
    const layerX = layer.x;
    const layerY = layer.y;
    const layerWidth = layer.width;
    const layerHeight = layer.height;
    
    // Calculate handle positions
    let handleX = 0;
    let handleY = 0;
    
    switch (handlePosition) {
      case 'top-left':
        handleX = layerX;
        handleY = layerY;
        break;
      case 'top':
        handleX = layerX + layerWidth / 2;
        handleY = layerY;
        break;
      case 'top-right':
        handleX = layerX + layerWidth;
        handleY = layerY;
        break;
      case 'left':
        handleX = layerX;
        handleY = layerY + layerHeight / 2;
        break;
      case 'right':
        handleX = layerX + layerWidth;
        handleY = layerY + layerHeight / 2;
        break;
      case 'bottom-left':
        handleX = layerX;
        handleY = layerY + layerHeight;
        break;
      case 'bottom':
        handleX = layerX + layerWidth / 2;
        handleY = layerY + layerHeight;
        break;
      case 'bottom-right':
        handleX = layerX + layerWidth;
        handleY = layerY + layerHeight;
        break;
    }
    
    // Check if point is within handle area
    return (
      x >= handleX - halfHandleSize &&
      x <= handleX + halfHandleSize &&
      y >= handleY - halfHandleSize &&
      y <= handleY + halfHandleSize
    );
  };
  
  // Helper function to get cursor style based on handle position
  const getResizeCursor = (handlePosition: ResizeHandlePosition | null): string => {
    switch (handlePosition) {
      case 'top-left':
      case 'bottom-right':
        return 'nwse-resize';
      case 'top-right':
      case 'bottom-left':
        return 'nesw-resize';
      case 'top':
      case 'bottom':
        return 'ns-resize';
      case 'left':
      case 'right':
        return 'ew-resize';
      default:
        return editorState.dragMode ? 'move' : 'default';
    }
  };
  
  // Extend drawSelectionBox to include resize handles
  const drawResizeHandles = (ctx: CanvasRenderingContext2D, layer: Layer) => {
    if (!layer.width || !layer.height) return;
    
    const handleSize = 8 / editorState.scale; // Scale handle size inversely with canvas zoom
    const x = layer.x;
    const y = layer.y;
    const width = layer.width;
    const height = layer.height;
    
    // Define handle positions
    const handles: [number, number, ResizeHandlePosition][] = [
      [x, y, 'top-left'],
      [x + width / 2, y, 'top'],
      [x + width, y, 'top-right'],
      [x, y + height / 2, 'left'],
      [x + width, y + height / 2, 'right'],
      [x, y + height, 'bottom-left'],
      [x + width / 2, y + height, 'bottom'],
      [x + width, y + height, 'bottom-right']
    ];
    
    // Draw handles
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0070f3';
    ctx.lineWidth = 1 / editorState.scale;
    
    for (const [hx, hy, position] of handles) {
      ctx.beginPath();
      ctx.rect(
        hx - handleSize / 2, 
        hy - handleSize / 2, 
        handleSize, 
        handleSize
      );
      ctx.fill();
      ctx.stroke();
    }
  };
  
  // Helper text for resize instructions
  const resizeInstructions = (
    <div className="mt-2 p-2 bg-muted rounded-md">
      <h4 className="text-xs font-semibold mb-1">Resize Tips:</h4>
      <ul className="text-xs text-muted-foreground space-y-1">
        <li className="flex items-center gap-1">
          <CornerDownRight className="w-3 h-3" /> Drag corners or edges to resize
        </li>
        <li>Hold Shift to maintain aspect ratio</li>
      </ul>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="border-b p-4 flex justify-between items-center bg-card">
        <h1 className="text-2xl font-bold">Thumbnail Editor</h1>
        <div className="flex gap-2">
          <Button onClick={handleExport} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Tools */}
        <div className="w-64 border-r p-4 bg-card">
          <Tabs defaultValue="tools">
            <TabsList className="w-full">
              <TabsTrigger value="tools" className="flex-1">Tools</TabsTrigger>
              <TabsTrigger value="layer" className="flex-1">Layer</TabsTrigger>
            </TabsList>
            
            <TabsContent value="tools" className="pt-4">
              <div className="space-y-4">
                <div>
                  <Label>Add Layer</Label>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={addTextLayer} className="bg-primary">
                      <Type className="w-4 h-4 mr-2" />
                      Text
                    </Button>
                    <Button size="sm" variant="outline" asChild className="border-primary/50">
                      <label>
                        <ImageIcon className="w-4 h-4 mr-2" />
                        Image
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png"
                          className="hidden"
                          onChange={handleImageUpload}
                        />
                      </label>
                    </Button>
                  </div>
                </div>
                
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="drag-mode">Drag Mode</Label>
                    <Switch
                      id="drag-mode"
                      checked={editorState.dragMode}
                      onCheckedChange={toggleDragMode}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="snap-lines">Snapping</Label>
                    <Switch
                      id="snap-lines"
                      checked={editorState.showSnapLines}
                      onCheckedChange={toggleSnapLines}
                    />
                  </div>

                  <div className="mt-4">
                    <Label className="mb-2 block">Zoom: {Math.round(editorState.scale * 100)}%</Label>
                    <Slider
                      value={[editorState.scale * 100]}
                      min={10}
                      max={300}
                      step={5}
                      onValueChange={(value) => {
                        setEditorState(prev => ({
                          ...prev,
                          scale: value[0] / 100
                        }));
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Hold Ctrl/Cmd + scroll to zoom
                    </p>
                  </div>
                  
                  <p className="text-xs text-muted-foreground mt-1">
                    Hold Ctrl/Cmd to see distances to canvas edges
                  </p>

                  {editorState.activeLayerId && resizeInstructions}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="layer" className="h-[calc(100vh-12rem)]">
              {activeLayer && (
                <>
                  {activeLayer.type === 'text' && (
                    <TextEditorPanel 
                      layer={activeLayer} 
                      onUpdate={handleUpdateLayer} 
                    />
                  )}
                  
                  {activeLayer.type === 'image' && (
                    <ImageEditorPanel 
                      layer={activeLayer} 
                      onUpdate={handleUpdateLayer} 
                    />
                  )}
                </>
              )}
              
              {!activeLayer && (
                <div className="text-sm text-muted-foreground text-center py-6">
                  Select a layer to edit its properties
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Main Canvas Area */}
        <div 
          className="flex-1 overflow-hidden bg-muted/40 flex items-center justify-center"
          ref={containerRef}
          onWheel={handleWheel}
        >
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={editorState.canvasWidth}
              height={editorState.canvasHeight}
              style={{
                width: `${editorState.canvasWidth * editorState.scale}px`,
                height: `${editorState.canvasHeight * editorState.scale}px`,
                cursor: resizeState.isResizing 
                  ? getResizeCursor(resizeState.handlePosition) 
                  : (editorState.dragMode ? 'move' : 'default')
              }}
              className="shadow-lg border border-muted"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
            <div className="absolute bottom-2 right-2 bg-card/70 backdrop-blur-sm px-2 py-1 text-xs rounded-md shadow-sm">
              {Math.round(editorState.scale * 100)}% | {editorState.canvasWidth}×{editorState.canvasHeight}
            </div>
          </div>
        </div>
        
        {/* Right Sidebar - Layers */}
        <div className="w-64 border-l p-4 flex flex-col bg-card">
          <LayerPanel
            layers={editorState.layers}
            activeLayerId={editorState.activeLayerId}
            onLayerClick={handleLayerClick}
            onToggleVisibility={handleToggleVisibility}
            onDeleteLayer={handleDeleteLayer}
            onLayerNameChange={handleLayerNameChange}
            onMoveLayer={handleMoveLayer}
          />
        </div>
      </div>
      
      {/* Export Modal */}
      <ExportImageModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportConfirm}
        previewUrl={exportPreviewUrl}
      />
    </div>
  );
};

export default ImageEditor; 