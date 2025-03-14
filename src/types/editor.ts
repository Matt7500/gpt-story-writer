export interface ImageLayerData {
  src: string;
}

export interface TextLayerData {
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

export interface Layer {
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

export interface EditorState {
  canvasWidth: number;
  canvasHeight: number;
  layers: Layer[];
  activeLayerId: string | null;
  scale: number;
  showSnapLines: boolean;
  showDistanceIndicators: boolean;
  dragMode: boolean;
}

export interface SnapResult {
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

export interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  layerStartX: number;
  layerStartY: number;
  snapResult: SnapResult | null;
}

export interface Font {
  name: string;
  family: string;
  isSystem: boolean;
  url?: string;
}

export interface ExportOptions {
  format: 'png' | 'jpeg';
  quality: number;
  scale: number;
  fileName: string;
} 