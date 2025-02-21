const Replicate = require('replicate');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { createCanvas, loadImage, registerFont } = require('canvas');
const fontService = require('./FontService');
const { supabase } = require('../../supabaseClient');

class VideoGenerationService {
  constructor() {
    this.replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });
    
    // Initialize setup
    this.init();
    
    // Store active generations
    this.activeGenerations = new Map();
  }

  async init() {
    try {
      await this.setupDirectories();
      await this.setupFonts();
    } catch (error) {
      console.error('Error during initialization:', error);
      // Continue without failing - we'll use fallback fonts if needed
    }
  }

  async setupDirectories() {
    const dirs = [
      'temp', 
      'temp/images', 
      'temp/audio', 
      'temp/video',
      'assets',
      'assets/fonts'
    ];
    
    for (const dir of dirs) {
      const dirPath = path.join(process.cwd(), dir);
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  async setupFonts() {
    const fontPath = path.join(process.cwd(), 'assets/fonts/Inter-Bold.ttf');
    
    try {
      // Check if font file exists
      await fs.access(fontPath);
      registerFont(fontPath, { family: 'Inter', weight: 'bold' });
    } catch (error) {
      console.log('Inter-Bold font not found, using system default');
      this.useSystemFont = true;
    }
  }

  async generateImage(title, userId, fontId = null) {
    try {
      // Update status
      this.updateGenerationStatus(userId, 'Generating background image...');

      // Generate image using Replicate's Stable Diffusion
      const output = await this.replicate.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        {
          input: {
            prompt: "A dark, moody background suitable for a story thumbnail, abstract, professional quality, dark colors",
            negative_prompt: "text, words, letters, watermark, signature, logo",
            width: 1920,
            height: 1080,
            num_outputs: 1,
            scheduler: "K_EULER",
            num_inference_steps: 50,
            guidance_scale: 7.5,
          }
        }
      );

      // Download the generated image
      const imageUrl = output[0];
      const response = await fetch(imageUrl);
      const buffer = await response.buffer();
      
      // Save the original image
      const originalImagePath = path.join(process.cwd(), 'temp/images', `${userId}_original.png`);
      await fs.writeFile(originalImagePath, buffer);

      // Create thumbnail version (16:9 aspect ratio)
      const thumbnailPath = path.join(process.cwd(), 'temp/images', `${userId}_thumbnail.png`);
      await sharp(buffer)
        .resize(1920, 1080, {
          fit: 'cover',
          position: 'center'
        })
        .toFile(thumbnailPath);

      // Add title text overlay with custom font if specified
      await this.addTitleOverlay(thumbnailPath, title, userId, fontId);

      return {
        originalPath: originalImagePath,
        thumbnailPath: thumbnailPath
      };
    } catch (error) {
      console.error('Error generating image:', error);
      throw new Error('Failed to generate background image');
    }
  }

  async addTitleOverlay(imagePath, title, userId, fontId = null) {
    try {
      // Update status
      this.updateGenerationStatus(userId, 'Adding title overlay...');

      // Load the background image
      const image = await loadImage(imagePath);
      
      // Create canvas with same dimensions as image
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');

      // Draw background image
      ctx.drawImage(image, 0, 0);

      // Add semi-transparent dark overlay for better text visibility
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Configure text style
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';

      // Calculate font size (responsive to canvas width)
      const maxWidth = canvas.width * 0.8;
      let fontSize = 120;
      
      // Get font information
      let fontFamily = this.useSystemFont ? 'Arial' : 'Inter';
      let fontWeight = 'bold';

      if (fontId) {
        try {
          // Fetch font information from database
          const { data: font, error } = await supabase
            .from('user_fonts')
            .select('*')
            .eq('id', fontId)
            .eq('user_id', userId)
            .single();

          if (!error && font) {
            // Load the custom font
            const fontLoaded = await fontService.loadFont(
              font.font_file_path,
              font.font_family,
              font.font_weight
            );

            if (fontLoaded) {
              fontFamily = font.font_family;
              fontWeight = font.font_weight;
            }
          }
        } catch (error) {
          console.error('Error loading custom font:', error);
          // Fall back to default font
        }
      }

      ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;

      // Reduce font size until text fits
      while (ctx.measureText(title).width > maxWidth && fontSize > 40) {
        fontSize -= 2;
        ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
      }

      // Add text shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 5;

      // Draw title
      ctx.fillText(title, canvas.width / 2, canvas.height / 2);

      // Save the result
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(imagePath, buffer);

    } catch (error) {
      console.error('Error adding title overlay:', error);
      throw new Error('Failed to add title overlay');
    }
  }

  updateGenerationStatus(userId, message) {
    this.activeGenerations.set(userId, {
      status: 'processing',
      message: message,
      timestamp: Date.now()
    });
  }

  getGenerationStatus(userId) {
    return this.activeGenerations.get(userId) || {
      status: 'not_found',
      message: 'No active generation found'
    };
  }
}

// Export singleton instance
module.exports = new VideoGenerationService(); 