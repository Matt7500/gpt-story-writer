import { Layer } from '../types/editor';

// Constants for snapping
export const SNAP_THRESHOLD = 10; // px
export const DISTANCE_INDICATOR_COLOR = 'rgba(0, 120, 255, 0.7)';

// Interface for snapping points
interface SnapPoint {
  type: 'edge' | 'center';
  position: number;
  orientation: 'horizontal' | 'vertical';
}

// Interface to represent snap results
interface SnapResult {
  x: number;
  y: number;
  snapped: {
    horizontal: boolean;
    vertical: boolean;
  };
  snapLines: {
    horizontal: number | null;
    vertical: number | null;
  };
}

/**
 * Generate snap points based on canvas dimensions
 */
export const generateCanvasSnapPoints = (
  canvasWidth: number,
  canvasHeight: number
): SnapPoint[] => {
  return [
    // Horizontal edges
    { type: 'edge', position: 0, orientation: 'horizontal' },
    { type: 'edge', position: canvasHeight, orientation: 'horizontal' },
    
    // Vertical edges
    { type: 'edge', position: 0, orientation: 'vertical' },
    { type: 'edge', position: canvasWidth, orientation: 'vertical' },
    
    // Horizontal center
    { type: 'center', position: canvasHeight / 2, orientation: 'horizontal' },
    
    // Vertical center
    { type: 'center', position: canvasWidth / 2, orientation: 'vertical' },
  ];
};

/**
 * Calculate snap points for a layer
 */
export const getLayerSnapPoints = (layer: Layer): SnapPoint[] => {
  const width = layer.width || 0;
  const height = layer.height || 0;
  
  return [
    // Top edge
    { type: 'edge', position: layer.y, orientation: 'horizontal' },
    // Bottom edge
    { type: 'edge', position: layer.y + height, orientation: 'horizontal' },
    // Left edge
    { type: 'edge', position: layer.x, orientation: 'vertical' },
    // Right edge
    { type: 'edge', position: layer.x + width, orientation: 'vertical' },
    // Horizontal center
    { type: 'center', position: layer.y + height / 2, orientation: 'horizontal' },
    // Vertical center
    { type: 'center', position: layer.x + width / 2, orientation: 'vertical' },
  ];
};

/**
 * Calculate snap position for a layer based on other layers and canvas
 */
export const calculateSnapPosition = (
  activeLayer: Layer,
  allLayers: Layer[],
  canvasWidth: number,
  canvasHeight: number,
  x: number,
  y: number
): SnapResult => {
  const otherLayers = allLayers.filter(layer => layer.id !== activeLayer.id);
  
  // Get all snap points
  const canvasSnapPoints = generateCanvasSnapPoints(canvasWidth, canvasHeight);
  const otherLayersSnapPoints = otherLayers.flatMap(getLayerSnapPoints);
  const allSnapPoints = [...canvasSnapPoints, ...otherLayersSnapPoints];
  
  // Calculate active layer dimensions
  const width = activeLayer.width || 0;
  const height = activeLayer.height || 0;
  
  // Calculate active layer snap points based on the current position
  const activeLayerSnapPoints = [
    // Top edge
    { point: y, orientation: 'horizontal', type: 'edge' },
    // Bottom edge
    { point: y + height, orientation: 'horizontal', type: 'edge' },
    // Left edge
    { point: x, orientation: 'vertical', type: 'edge' },
    // Right edge
    { point: x + width, orientation: 'vertical', type: 'edge' },
    // Horizontal center
    { point: y + height / 2, orientation: 'horizontal', type: 'center' },
    // Vertical center
    { point: x + width / 2, orientation: 'vertical', type: 'center' },
  ];
  
  // Initialize result
  let result: SnapResult = {
    x,
    y,
    snapped: {
      horizontal: false,
      vertical: false,
    },
    snapLines: {
      horizontal: null,
      vertical: null,
    },
  };
  
  // Check for snaps on each point
  for (const activePoint of activeLayerSnapPoints) {
    const relevantSnapPoints = allSnapPoints.filter(
      point => point.orientation === activePoint.orientation
    );
    
    for (const snapPoint of relevantSnapPoints) {
      const distance = Math.abs(activePoint.point - snapPoint.position);
      
      if (distance <= SNAP_THRESHOLD) {
        const offset = snapPoint.position - activePoint.point;
        
        if (activePoint.orientation === 'horizontal') {
          result.y += offset;
          result.snapped.horizontal = true;
          result.snapLines.horizontal = snapPoint.position;
          break; // Only snap to one point in each orientation
        } else {
          result.x += offset;
          result.snapped.vertical = true;
          result.snapLines.vertical = snapPoint.position;
          break; // Only snap to one point in each orientation
        }
      }
    }
  }
  
  return result;
};

/**
 * Draw snap lines on the canvas
 */
export const drawSnapLines = (
  ctx: CanvasRenderingContext2D,
  snapResult: SnapResult,
  canvasWidth: number,
  canvasHeight: number
) => {
  ctx.save();
  ctx.strokeStyle = DISTANCE_INDICATOR_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  
  // Draw horizontal snap line
  if (snapResult.snapLines.horizontal !== null) {
    const y = snapResult.snapLines.horizontal;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
    ctx.stroke();
  }
  
  // Draw vertical snap line
  if (snapResult.snapLines.vertical !== null) {
    const x = snapResult.snapLines.vertical;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();
  }
  
  ctx.restore();
};

/**
 * Draw distance indicators between a layer and canvas edges
 */
export const drawDistanceIndicators = (
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  canvasWidth: number,
  canvasHeight: number
) => {
  const layerWidth = layer.width || 0;
  const layerHeight = layer.height || 0;
  const layerRight = layer.x + layerWidth;
  const layerBottom = layer.y + layerHeight;
  
  ctx.save();
  
  // Style for distance indicators
  ctx.strokeStyle = DISTANCE_INDICATOR_COLOR;
  ctx.fillStyle = DISTANCE_INDICATOR_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  
  // Left distance
  if (layer.x > 0) {
    const distance = Math.round(layer.x);
    ctx.beginPath();
    ctx.moveTo(0, layer.y + layerHeight / 2);
    ctx.lineTo(layer.x, layer.y + layerHeight / 2);
    ctx.stroke();
    
    // Draw text in the middle
    ctx.fillText(
      `${distance}px`, 
      layer.x / 2, 
      layer.y + layerHeight / 2 - 5
    );
  }
  
  // Right distance
  if (layerRight < canvasWidth) {
    const distance = Math.round(canvasWidth - layerRight);
    ctx.beginPath();
    ctx.moveTo(layerRight, layer.y + layerHeight / 2);
    ctx.lineTo(canvasWidth, layer.y + layerHeight / 2);
    ctx.stroke();
    
    // Draw text in the middle
    ctx.fillText(
      `${distance}px`, 
      layerRight + (canvasWidth - layerRight) / 2, 
      layer.y + layerHeight / 2 - 5
    );
  }
  
  // Top distance
  if (layer.y > 0) {
    const distance = Math.round(layer.y);
    ctx.beginPath();
    ctx.moveTo(layer.x + layerWidth / 2, 0);
    ctx.lineTo(layer.x + layerWidth / 2, layer.y);
    ctx.stroke();
    
    // Draw text in the middle
    ctx.fillText(
      `${distance}px`, 
      layer.x + layerWidth / 2, 
      layer.y / 2
    );
  }
  
  // Bottom distance
  if (layerBottom < canvasHeight) {
    const distance = Math.round(canvasHeight - layerBottom);
    ctx.beginPath();
    ctx.moveTo(layer.x + layerWidth / 2, layerBottom);
    ctx.lineTo(layer.x + layerWidth / 2, canvasHeight);
    ctx.stroke();
    
    // Draw text in the middle
    ctx.fillText(
      `${distance}px`, 
      layer.x + layerWidth / 2, 
      layerBottom + (canvasHeight - layerBottom) / 2
    );
  }
  
  ctx.restore();
};

// Helper to determine if coordinates are within a layer's bounds
export const isPointInLayer = (
  x: number, 
  y: number, 
  layer: Layer, 
  scale: number = 1
): boolean => {
  const width = layer.width || 0;
  const height = layer.height || 0;
  
  return (
    x >= layer.x * scale &&
    x <= (layer.x + width) * scale &&
    y >= layer.y * scale &&
    y <= (layer.y + height) * scale
  );
};

// Helper to draw a selection box around a layer
export const drawSelectionBox = (
  ctx: CanvasRenderingContext2D,
  layer: Layer
) => {
  const width = layer.width || 0;
  const height = layer.height || 0;
  
  ctx.save();
  
  // Draw selection box
  ctx.strokeStyle = '#1a85ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.strokeRect(layer.x - 2, layer.y - 2, width + 4, height + 4);
  
  // Draw corner handles
  const handleSize = 8;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1a85ff';
  
  // Top-left handle
  ctx.fillRect(layer.x - handleSize / 2, layer.y - handleSize / 2, handleSize, handleSize);
  ctx.strokeRect(layer.x - handleSize / 2, layer.y - handleSize / 2, handleSize, handleSize);
  
  // Top-right handle
  ctx.fillRect(layer.x + width - handleSize / 2, layer.y - handleSize / 2, handleSize, handleSize);
  ctx.strokeRect(layer.x + width - handleSize / 2, layer.y - handleSize / 2, handleSize, handleSize);
  
  // Bottom-left handle
  ctx.fillRect(layer.x - handleSize / 2, layer.y + height - handleSize / 2, handleSize, handleSize);
  ctx.strokeRect(layer.x - handleSize / 2, layer.y + height - handleSize / 2, handleSize, handleSize);
  
  // Bottom-right handle
  ctx.fillRect(layer.x + width - handleSize / 2, layer.y + height - handleSize / 2, handleSize, handleSize);
  ctx.strokeRect(layer.x + width - handleSize / 2, layer.y + height - handleSize / 2, handleSize, handleSize);
  
  ctx.restore();
};

// Adjust a value to account for scale when converting from screen to canvas coordinates
export const scalePoint = (point: number, scale: number): number => {
  return point / scale;
}; 