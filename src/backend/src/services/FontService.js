const path = require('path');
const fs = require('fs').promises;
const { createCanvas, registerFont } = require('canvas');
const fontkit = require('fontkit');

class FontService {
  constructor() {
    this.fontCache = new Map();
    this.init();
  }

  async init() {
    try {
      await this.setupDirectories();
    } catch (error) {
      console.error('Error initializing FontService:', error);
    }
  }

  async setupDirectories() {
    const dirs = ['user_fonts'];
    for (const dir of dirs) {
      const dirPath = path.join(process.cwd(), dir);
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  async validateFontFile(filePath) {
    try {
      // Read and parse the font file
      const buffer = await fs.readFile(filePath);
      const font = await fontkit.create(buffer);

      // Extract font information
      return {
        isValid: true,
        fontFamily: font.familyName,
        fontWeight: font.weight,
        postscriptName: font.postscriptName
      };
    } catch (error) {
      console.error('Font validation error:', error);
      return {
        isValid: false,
        error: 'Invalid font file'
      };
    }
  }

  async saveFontFile(tempPath, userId, fontId) {
    const targetDir = path.join(process.cwd(), 'user_fonts', userId);
    await fs.mkdir(targetDir, { recursive: true });

    const extension = path.extname(tempPath);
    const targetPath = path.join(targetDir, `${fontId}${extension}`);

    await fs.copyFile(tempPath, targetPath);
    return targetPath;
  }

  async loadFont(fontPath, fontFamily, fontWeight = 'normal') {
    const cacheKey = `${fontPath}-${fontFamily}-${fontWeight}`;

    if (!this.fontCache.has(cacheKey)) {
      try {
        await fs.access(fontPath);
        registerFont(fontPath, { family: fontFamily, weight: fontWeight });
        this.fontCache.set(cacheKey, true);
        return true;
      } catch (error) {
        console.error('Error loading font:', error);
        return false;
      }
    }

    return true;
  }

  async previewFont(fontPath, text = 'Preview Text') {
    try {
      // Create a small canvas for preview
      const canvas = createCanvas(400, 100);
      const ctx = canvas.getContext('2d');

      // Set background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Configure text
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '32px Arial'; // Default font first

      // Try to load and use the custom font
      const fontInfo = await this.validateFontFile(fontPath);
      if (fontInfo.isValid) {
        await this.loadFont(fontPath, fontInfo.fontFamily, fontInfo.fontWeight);
        ctx.font = `32px "${fontInfo.fontFamily}"`;
      }

      // Draw text
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);

      // Return as buffer
      return canvas.toBuffer('image/png');
    } catch (error) {
      console.error('Error creating font preview:', error);
      throw new Error('Failed to create font preview');
    }
  }

  async cleanupFont(userId, fontId) {
    try {
      const fontDir = path.join(process.cwd(), 'user_fonts', userId);
      const files = await fs.readdir(fontDir);
      
      // Find and delete the font file
      const fontFile = files.find(file => file.startsWith(fontId));
      if (fontFile) {
        await fs.unlink(path.join(fontDir, fontFile));
      }

      // Remove from cache
      this.fontCache.delete(`${fontId}`);
    } catch (error) {
      console.error('Error cleaning up font:', error);
    }
  }
}

// Export singleton instance
module.exports = new FontService(); 