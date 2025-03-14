import { Layer, TextLayerData, ImageLayerData } from '../types/editor';

/**
 * Render an image layer on the canvas
 */
export const renderImageLayer = (
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  imageCache: Map<string, HTMLImageElement>
) => {
  if (layer.type !== 'image') return;
  const imageData = layer.data as ImageLayerData;
  const image = imageCache.get(imageData.src);
  
  if (!image) return;
  
  ctx.save();
  
  // Set the transformation origin to the center of the image
  const centerX = layer.x + (layer.width || 0) / 2;
  const centerY = layer.y + (layer.height || 0) / 2;
  
  ctx.translate(centerX, centerY);
  
  // Apply rotation if needed
  if (layer.rotation !== 0) {
    ctx.rotate((layer.rotation * Math.PI) / 180);
  }
  
  // Apply horizontal flip if needed
  if (layer.flipped) {
    ctx.scale(-1, 1);
  }
  
  // Draw the image centered at the origin (0,0) which is now at the center of the image
  ctx.drawImage(
    image,
    -(layer.width || 0) / 2,
    -(layer.height || 0) / 2,
    layer.width || 0,
    layer.height || 0
  );
  
  ctx.restore();
};

/**
 * Render a text layer on the canvas
 */
export const renderTextLayer = (
  ctx: CanvasRenderingContext2D,
  layer: Layer
) => {
  if (layer.type !== 'text') return;
  const textData = layer.data as TextLayerData;
  
  ctx.save();
  
  // Set the transformation origin to the center of the text
  // Since we don't know exact dimensions, we'll use the estimated height and width
  const estimatedWidth = calculateTextWidth(ctx, textData);
  const estimatedHeight = calculateTextHeight(textData);
  
  const centerX = layer.x + estimatedWidth / 2;
  const centerY = layer.y + estimatedHeight / 2;
  
  ctx.translate(centerX, centerY);
  
  // Apply rotation if needed
  if (layer.rotation !== 0) {
    ctx.rotate((layer.rotation * Math.PI) / 180);
  }
  
  // Apply horizontal flip if needed
  if (layer.flipped) {
    ctx.scale(-1, 1);
  }
  
  // Prepare font style
  ctx.font = `${textData.fontSize}px ${textData.fontFamily}`;
  ctx.fillStyle = textData.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Apply letter spacing
  if (textData.letterSpacing !== 0) {
    ctx.letterSpacing = `${textData.letterSpacing}px`;
  }
  
  // Draw stroke if enabled
  if (textData.stroke.enabled) {
    ctx.strokeStyle = textData.stroke.color;
    ctx.lineWidth = textData.stroke.width;
    ctx.lineJoin = 'round';
  }
  
  // Split text by lines
  const lines = textData.text.split('\n');
  const lineHeight = textData.fontSize * textData.lineHeight;
  
  // Calculate vertical position for the first line
  const startY = -(lines.length - 1) * lineHeight / 2;
  
  // Draw each line
  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    
    if (textData.stroke.enabled) {
      ctx.strokeText(lines[i], 0, y);
    }
    
    ctx.fillText(lines[i], 0, y);
  }
  
  ctx.restore();
};

/**
 * Estimate the width of a text layer based on its content and styling
 */
export const calculateTextWidth = (
  ctx: CanvasRenderingContext2D,
  textData: TextLayerData
): number => {
  ctx.save();
  ctx.font = `${textData.fontSize}px ${textData.fontFamily}`;
  
  // Split text by lines and find the widest one
  const lines = textData.text.split('\n');
  let maxWidth = 0;
  
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    const lineWidth = metrics.width + (line.length - 1) * textData.letterSpacing;
    maxWidth = Math.max(maxWidth, lineWidth);
  }
  
  ctx.restore();
  
  // Add additional width for stroke if enabled
  if (textData.stroke.enabled) {
    maxWidth += textData.stroke.width * 2;
  }
  
  return maxWidth;
};

/**
 * Estimate the height of a text layer based on its content and styling
 */
export const calculateTextHeight = (textData: TextLayerData): number => {
  const lines = textData.text.split('\n');
  const lineHeight = textData.fontSize * textData.lineHeight;
  const textHeight = lines.length * lineHeight;
  
  // Add additional height for stroke if enabled
  if (textData.stroke.enabled) {
    return textHeight + textData.stroke.width * 2;
  }
  
  return textHeight;
};

/**
 * Calculate approximate dimensions for a text layer
 */
export const calculateTextDimensions = (
  ctx: CanvasRenderingContext2D,
  layer: Layer
): { width: number; height: number } => {
  if (layer.type !== 'text') {
    return { width: 0, height: 0 };
  }
  
  const textData = layer.data as TextLayerData;
  const width = calculateTextWidth(ctx, textData);
  const height = calculateTextHeight(textData);
  
  return { width, height };
};

/**
 * Pre-load and cache an image for rendering
 */
export const loadImage = (
  src: string,
  imageCache: Map<string, HTMLImageElement>
): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    if (imageCache.has(src)) {
      resolve(imageCache.get(src)!);
      return;
    }
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    
    img.onerror = () => {
      reject(new Error(`Failed to load image: ${src}`));
    };
    
    img.src = src;
  });
};

/**
 * Export the canvas as an image
 */
export const exportCanvasToImage = (
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpeg' = 'png',
  quality: number = 1.0
): string => {
  return canvas.toDataURL(`image/${format}`, quality);
};

/**
 * Create a download link for the exported image
 */
export const downloadImage = (
  dataUrl: string,
  fileName: string = 'thumbnail'
) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}; 