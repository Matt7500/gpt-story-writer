const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { Configuration, OpenAIApi } = require('openai');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const userSettingsService = require('./services/UserSettingsService');
const videoGenerationService = require('./services/VideoGenerationService');
const multer = require('multer');
const fontService = require('./services/FontService');
const fs = require('fs');
const logger = require('./utils/logger');

// Load environment variables from the root directory
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Initialize OpenAI client and story module
const OpenAI = require('openai');
let openai = null; // We'll initialize this per-request based on user settings

const { 
  storyIdeas, 
  createTitle, 
  createOutline, 
  charactersFn,
  initializeClients,
  writeScene,
  callTune4,
  rewriteInChunks
} = require('./story');

// Initialize clients and start server
(async () => {
  try {
    await initializeClients();
    console.log('Story module initialized successfully');

    // Start server after initialization
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to initialize story module:', err);
    process.exit(1);
  }
})();

// Add debug logging for the imported functions
console.log('Imported functions:', {
  storyIdeas: typeof storyIdeas,
  createTitle: typeof createTitle,
  createOutline: typeof createOutline,
  charactersFn: typeof charactersFn,
  writeScene: typeof writeScene,
  callTune4: typeof callTune4,
  rewriteInChunks: typeof rewriteInChunks
});

// Validate required environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const app = express();
const port = process.env.PORT || 3001;

// Initialize Supabase client with service role key
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Service Key:', supabaseKey ? 'Present' : 'Missing');

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:3000',
  'https://story-writer.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

// Configure CORS middleware
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) === -1) {
      console.log('Origin attempted:', origin);
      // Allow all origins in development
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Add CORS headers to all responses
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

// Handle preflight requests
app.options('*', cors(corsOptions));

app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Middleware to verify Supabase session and initialize OpenAI client
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Clear the cache and get fresh settings
    userSettingsService.clearCache(user.id);
    const settings = await userSettingsService.getSettings(user.id);
    
    // Initialize OpenRouter client
    const openRouter = new OpenAI({
      apiKey: settings.openrouter_key,
      baseURL: "https://openrouter.ai/api/v1"
    });

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: settings.openai_key
    });

    // Check for required API keys based on the endpoint and settings
    const endpoint = req.path;
    if (endpoint.includes('/stories/write-scene') || endpoint.includes('/stories/initialize')) {
      if (settings.use_openai_for_story_gen && !settings.openai_key) {
        return res.status(400).json({ error: 'OpenAI API key not configured' });
      }
      if (!settings.use_openai_for_story_gen && !settings.openrouter_key) {
        return res.status(400).json({ error: 'OpenRouter API key not configured' });
      }
    }

    // Add user, settings, and clients to request object
    req.user = user;
    req.userSettings = settings;
    req.openRouter = openRouter;
    req.openai = openai;

    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Map to store SSE clients and their abort controllers
const progressClients = new Map();
const abortControllers = new Map();

// Helper function to clean up clients and controllers
const cleanup = (clientId) => {
  const client = progressClients.get(clientId);
  if (client) {
    client.end();
    progressClients.delete(clientId);
  }
  abortControllers.delete(clientId);
};

// Helper function to send progress updates
const sendProgressUpdate = (clientId, data) => {
  const client = progressClients.get(clientId);
  if (client) {
    const payload = typeof data === 'number' ? { step: data } : data;
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
};

// Add SSE endpoint for progress updates
app.get('/api/stories/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Store the response object in a global map with a unique ID
  const clientId = req.query.clientId;
  if (clientId) {
    progressClients.set(clientId, res);
    // Create an AbortController for this client
    const controller = new AbortController();
    abortControllers.set(clientId, controller);
  }

  req.on('close', () => {
    // Get the abort controller for this client
    const controller = abortControllers.get(clientId);
    if (controller) {
      // Signal abort to cancel any ongoing operations
      controller.abort();
      abortControllers.delete(clientId);
      console.log(`Story generation cancelled for client ${clientId}`);
    }
    progressClients.delete(clientId);
  });
});

// Add SSE endpoint for scene writing progress
app.get('/api/stories/write-scene/progress', async (req, res) => {
  const clientId = req.query.clientId;
  const authToken = req.query.auth_token;

  if (!clientId) {
    return res.status(400).json({ error: 'Client ID is required' });
  }

  if (!authToken) {
    return res.status(401).json({ error: 'Authentication token is required' });
  }

  try {
    // Verify the auth token
    const { data: { user }, error } = await supabase.auth.getUser(authToken);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Clear the cache and get fresh settings
    userSettingsService.clearCache(user.id);
    const settings = await userSettingsService.getSettings(user.id);
    if (!settings.openrouter_key) {
      return res.status(400).json({ error: 'OpenRouter API key not configured' });
    }

    // Initialize OpenAI client with user's API key
    openai = new OpenAI({
      apiKey: settings.openrouter_key,
      baseURL: "https://openrouter.ai/api/v1"
    });

    // Add user, settings, and openai client to request object
    req.user = user;
    req.userSettings = settings;
    req.openai = openai;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Store the response object in the global map
    progressClients.set(clientId, res);

    // Create an AbortController for this client
    const controller = new AbortController();
    abortControllers.set(clientId, controller);

    req.on('close', () => {
      progressClients.delete(clientId);
      abortControllers.delete(clientId);
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// Add endpoint for scene writing
app.post('/api/stories/write-scene', authenticateUser, async (req, res) => {
  const { clientId, sceneBeat, characters, previousScenes } = req.body;

  await logger.logSceneWriting(req.user.id, {
    requestType: 'write_scene',
    clientId,
    prompt: `
## WRITING INSTRUCTIONS
- You are an expert fiction writer. Write a fully detailed scene that has as many details from the scene beat as possible.
- YOU MUST ONLY WRITE WHAT IS DIRECTLY IN THE SCENE BEAT. DO NOT WRITE ANYTHING ELSE.
- Address the passage of time mentioned at the beginning of the scene beat by creating a connection to the previous scene's ending.

## CORE REQUIREMENTS
- Write in plain text only, do not include any markdown formatting.
- Write from first-person narrator perspective only
- Begin with a clear connection to the previous scene's ending
- Include full, natural dialogue
- Write the dialogue in their own paragraphs, do not include the dialogue in the same paragraph as the narration.
- Write everything that the narrator sees, hears, and everything that happens in the scene.
- Write the entire scene and include everything in the scene beat given, do not leave anything out.
- Use the character's pronouns if you don't write the character's name. Avoid using they/them pronouns, use the character's pronouns instead.
- You MUST write ALL dialogue you can in the scene.

## SCENE CONTEXT AND CONTINUITY
# Characters
${characters}

# Use the provided STORY CONTEXT to remember details and events from the previous scenes in order to maintain consistency in the new scene you are writing.
## STORY CONTEXT
<context>
    ${previousScenes?.join('\n\n')}
</context>

# Scene Beat to Write
${sceneBeat}`
  });

  if (!clientId || !sceneBeat || !characters) {
    await logger.logError(req.user.id, new Error('Missing required fields'));
    return res.status(400).json({ 
      error: 'Missing required fields: clientId, sceneBeat, characters' 
    });
  }

  try {
    const controller = abortControllers.get(clientId);
    const signal = controller ? controller.signal : null;

    if (signal?.aborted) {
      await logger.logError(req.user.id, new Error('Scene generation cancelled'));
      throw new Error('Scene generation cancelled');
    }

    let fullResponse = "";
    const onProgress = (partialContent) => {
      fullResponse += partialContent;
      sendProgressUpdate(clientId, { content: partialContent, isPartial: true });
    };

    const scene = await writeScene(
      sceneBeat,
      characters,
      previousScenes.length,
      previousScenes.length + 1,
      previousScenes,
      onProgress,
      req
    );

    await logger.logSceneWriting(req.user.id, {
      status: 'success',
      clientId,
      sceneLength: scene.length,
      scenePreview: scene.substring(0, 200) + '...',
      fullResponse: fullResponse.substring(0, 1000) + '...' // Log first 1000 chars of the response
    });

    sendProgressUpdate(clientId, { content: scene, isPartial: false });

    const client = progressClients.get(clientId);
    if (client) {
      client.end();
      progressClients.delete(clientId);
    }
    abortControllers.delete(clientId);

    res.json({ success: true });
  } catch (error) {
    await logger.logError(req.user.id, error);
    cleanup(clientId);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to generate scene' 
    });
  }
});

// Add endpoint for scene revision based on feedback
app.post('/api/stories/revise-scene', authenticateUser, async (req, res) => {
  const { clientId, sceneBeat, characters, currentScene, feedback } = req.body;

  const revisionPrompt = `
Revise the following scene based on the user's feedback. Maintain the core elements of the scene beat
while addressing the specific feedback provided.

Original Scene Beat:
${sceneBeat}

Current Scene:
${currentScene}

User Feedback:
${feedback}

Characters:
${characters}

Please revise the scene to address the feedback while maintaining the story's continuity and quality.

ONLY RESPOND WITH THE REVISED SCENE. DO NOT WRITE ANY COMMENTS OR EXPLANATIONS.
`;

  await logger.logSceneFeedback(req.user.id, {
    requestType: 'revise_scene',
    clientId,
    prompt: revisionPrompt
  });

  if (!clientId || !sceneBeat || !characters || !currentScene || !feedback) {
    await logger.logError(req.user.id, new Error('Missing required fields'));
    return res.status(400).json({ 
      error: 'Missing required fields: clientId, sceneBeat, characters, currentScene, feedback' 
    });
  }

  try {
    const controller = abortControllers.get(clientId);
    const signal = controller ? controller.signal : null;

    if (signal?.aborted) {
      await logger.logError(req.user.id, new Error('Scene revision cancelled'));
      throw new Error('Scene revision cancelled');
    }

    let fullResponse = "";
    const onProgress = (partialContent) => {
      fullResponse += partialContent;
      sendProgressUpdate(clientId, { content: partialContent, isPartial: true });
    };

    // Generate the revised scene
    const response = await openai.chat.completions.create({
      model: process.env.OAI_MODEL || 'gpt-4',
      temperature: 0.5,
      messages: [
        { role: "system", content: "You are an expert fiction writer tasked with revising a scene based on user feedback." },
        { role: "user", content: revisionPrompt }
      ],
      temperature: 0.7,
      stream: true
    });

    let revisedScene = "";
    let currentChunk = "";

    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content || "";
      currentChunk += content;

      // If we have a reasonable chunk size or see a paragraph break, send progress
      if (currentChunk.length > 100 || currentChunk.includes("\n\n")) {
        if (onProgress) {
          onProgress(currentChunk);
        }
        revisedScene += currentChunk;
        currentChunk = "";
      }
    }

    // Send any remaining content
    if (currentChunk.trim() && onProgress) {
      onProgress(currentChunk.trim());
    }
    revisedScene += currentChunk.trim();

    // Send the final revised scene
    sendProgressUpdate(clientId, { content: revisedScene, isPartial: false });

    await logger.logSceneFeedback(req.user.id, {
      status: 'success',
      clientId,
      revisedSceneLength: revisedScene.length,
      revisedScenePreview: revisedScene.substring(0, 200) + '...',
      fullResponse: fullResponse.substring(0, 1000) + '...' // Log first 1000 chars of the response
    });

    // Clean up
    const client = progressClients.get(clientId);
    if (client) {
      client.end();
      progressClients.delete(clientId);
    }
    abortControllers.delete(clientId);

    res.json({ success: true });
  } catch (error) {
    await logger.logError(req.user.id, error);
    cleanup(clientId);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to revise scene' 
    });
  }
});

// Add endpoint for cancelling scene generation/revision
app.post('/api/stories/cancel', authenticateUser, async (req, res) => {
  const { clientId } = req.body;

  if (!clientId) {
    return res.status(400).json({ 
      error: 'Missing required field: clientId' 
    });
  }

  try {
    // Get the abort controller for this client
    const controller = abortControllers.get(clientId);
    if (controller) {
      // Abort any ongoing operations
      controller.abort();
      abortControllers.delete(clientId);
    }

    // Clean up the SSE connection
    const client = progressClients.get(clientId);
    if (client) {
      client.end();
      progressClients.delete(clientId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Cancel error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to cancel operation' 
    });
  }
});

// API Endpoints

// Initialize story generation
app.post('/api/stories/initialize', authenticateUser, async (req, res) => {
  const clientId = req.body.clientId;

  await logger.logStoryGeneration(req.user.id, {
    requestType: 'initialize_story',
    clientId,
    timestamp: new Date().toISOString()
  });

  try {
    const controller = abortControllers.get(clientId);
    const signal = controller ? controller.signal : null;

    if (signal?.aborted) {
      await logger.logError(req.user.id, new Error('Story generation cancelled'));
      throw new Error('Story generation cancelled');
    }

    let isAborted = false;
    signal?.addEventListener('abort', () => {
      isAborted = true;
      logger.logError(req.user.id, new Error('Story generation aborted'));
    });

    // Generate a unique UUID for the story
    const storyId = uuidv4();

    // Generate story idea
    sendProgressUpdate(clientId, 0);
    const storyIdea = await storyIdeas(req);
    if (!storyIdea) {
      throw new Error('Failed to generate story idea');
    }
    await logger.logStoryGeneration(req.user.id, {
      step: 'story_idea',
      storyIdea,
      prompt: 'Generate a unique and engaging story idea',
      response: storyIdea
    });

    // Generate title
    sendProgressUpdate(clientId, 1);
    const title = await createTitle(storyIdea, req);
    if (!title) {
      throw new Error('Failed to generate title');
    }
    await logger.logStoryGeneration(req.user.id, {
      step: 'title',
      title,
      prompt: `Generate a title for the story idea: ${storyIdea}`,
      response: title
    });

    // Create outline
    sendProgressUpdate(clientId, 2);
    const outline = await createOutline(storyIdea, req);
    if (!outline) {
      throw new Error('Failed to create outline');
    }
    await logger.logStoryGeneration(req.user.id, {
      step: 'outline',
      outlineLength: outline.length,
      prompt: `Create a detailed outline for the story: ${storyIdea}`,
      response: JSON.stringify(outline).substring(0, 1000) + '...'
    });

    // Generate characters
    sendProgressUpdate(clientId, 3);
    const characters = await charactersFn(outline, req);
    if (!characters) {
      throw new Error('Failed to generate characters');
    }
    await logger.logStoryGeneration(req.user.id, {
      step: 'characters',
      characters,
      prompt: `Generate characters for the story with outline: ${JSON.stringify(outline).substring(0, 200)}...`,
      response: JSON.stringify(characters)
    });

    // Save to database
    sendProgressUpdate(clientId, 4);
    
    if (isAborted) {
      throw new Error('Story generation cancelled');
    }

    const { data, error } = await supabase
      .from('stories')
      .insert([{
        id: storyId,
        user_id: req.user.id,
        title: title,
        story_idea: storyIdea,
        plot_outline: JSON.stringify(outline),
        characters: characters,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    await logger.logStoryGeneration(req.user.id, {
      status: 'success',
      storyId,
      title,
      storyIdea,
      outlineLength: outline.length,
      finalResponse: {
        title,
        storyIdea,
        outlinePreview: JSON.stringify(outline).substring(0, 200) + '...',
        charactersPreview: JSON.stringify(characters).substring(0, 200) + '...'
      }
    });

    // Close the SSE connection
    const client = progressClients.get(clientId);
    if (client) {
      client.end();
      progressClients.delete(clientId);
    }
    // Clean up the abort controller
    abortControllers.delete(clientId);

    res.json({
      success: true,
      story: data
    });

  } catch (error) {
    await logger.logError(req.user.id, error);
    cleanup(clientId);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user's stories
app.get('/api/stories', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      stories: data
    });

  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single story
app.get('/api/stories/:id', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Story not found'
      });
    }

    res.json({
      success: true,
      story: data
    });

  } catch (error) {
    console.error('Get story error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete story
app.delete('/api/stories/:id', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stories')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Story deleted successfully'
    });

  } catch (error) {
    console.error('Delete story error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add the tune4 endpoint
app.post('/api/tune4', authenticateUser, async (req, res) => {
  try {
    const { scene } = req.body;
    if (!scene) {
      console.log('Tune4 request rejected: missing scene content');
      return res.status(400).json({ error: 'Scene content is required' });
    }

    console.log('Processing tune4 request:', {
      sceneLength: scene.length,
      model: req.userSettings.rewrite_model || "gpt-4"
    });

    const processedScene = await callTune4(scene, req);
    
    console.log('Rewrite processing completed:', {
      originalLength: scene.length,
      processedLength: processedScene.length,
      model: req.userSettings.rewrite_model || "gpt-4"
    });

    res.json({ content: processedScene });
  } catch (error) {
    console.error('Error in rewrite endpoint:', {
      error: error.message,
      type: error.name,
      aborted: error.name === 'AbortError'
    });
    res.status(500).json({ error: 'Failed to process scene' });
  }
});

// Video Generation Endpoints
app.post('/api/video/generate', authenticateUser, async (req, res) => {
  try {
    const { title, chapters } = req.body;
    
    if (!title || !chapters) {
      return res.status(400).json({ 
        error: 'Missing required fields: title, chapters' 
      });
    }

    // Generate a unique ID for this video generation process
    const videoId = uuidv4();

    // Start the image generation process
    videoGenerationService.updateGenerationStatus(req.user.id, 'Starting image generation...');

    // Start the process asynchronously
    (async () => {
      try {
        const images = await videoGenerationService.generateImage(title, req.user.id);
        videoGenerationService.updateGenerationStatus(req.user.id, 'Image generation completed');
        
        // Store the paths for the next steps
        videoGenerationService.activeGenerations.set(req.user.id, {
          status: 'processing',
          message: 'Image generation completed',
          timestamp: Date.now(),
          videoId,
          images
        });

      } catch (error) {
        console.error('Error in video generation process:', error);
        videoGenerationService.activeGenerations.set(req.user.id, {
          status: 'failed',
          message: error.message,
          timestamp: Date.now(),
          videoId
        });
      }
    })();

    // Respond immediately with the video ID for status checking
    res.json({ 
      videoId,
      message: 'Video generation started'
    });

  } catch (error) {
    console.error('Error starting video generation:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to start video generation'
    });
  }
});

app.get('/api/video/status/:videoId', authenticateUser, (req, res) => {
  try {
    const status = videoGenerationService.getGenerationStatus(req.user.id);
    res.json(status);
  } catch (error) {
    console.error('Error getting video status:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get video status'
    });
  }
});

// Font Management Endpoints

// Configure multer for font uploads
const upload = multer({
  dest: 'temp/uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only .ttf and .otf files
    if (file.mimetype === 'font/ttf' || file.mimetype === 'font/otf' ||
        file.originalname.endsWith('.ttf') || file.originalname.endsWith('.otf')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .ttf and .otf files are allowed.'));
    }
  }
});

// Upload font
app.post('/api/fonts/upload', authenticateUser, upload.single('font'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No font file provided' });
    }

    // Validate the font file
    const validation = await fontService.validateFontFile(req.file.path);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }

    // Generate UUID for the font
    const fontId = uuidv4();

    // Save the font file
    const fontPath = await fontService.saveFontFile(req.file.path, req.user.id, fontId);

    // Save font information to database
    const { data: fontData, error: dbError } = await supabase
      .from('user_fonts')
      .insert({
        id: fontId,
        user_id: req.user.id,
        font_name: req.body.name || validation.fontFamily,
        font_file_path: fontPath,
        font_family: validation.fontFamily,
        font_weight: validation.fontWeight
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // Clean up temporary file
    await fs.unlink(req.file.path);

    res.json({
      success: true,
      font: fontData
    });

  } catch (error) {
    console.error('Font upload error:', error);
    res.status(500).json({ error: 'Failed to upload font' });
  }
});

// Get font preview
app.get('/api/fonts/:id/preview', authenticateUser, async (req, res) => {
  try {
    const { data: font, error } = await supabase
      .from('user_fonts')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !font) {
      return res.status(404).json({ error: 'Font not found' });
    }

    const previewBuffer = await fontService.previewFont(font.font_file_path);
    
    res.set('Content-Type', 'image/png');
    res.send(previewBuffer);

  } catch (error) {
    console.error('Font preview error:', error);
    res.status(500).json({ error: 'Failed to generate font preview' });
  }
});

// List user's fonts
app.get('/api/fonts', authenticateUser, async (req, res) => {
  try {
    const { data: fonts, error } = await supabase
      .from('user_fonts')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      fonts: fonts
    });

  } catch (error) {
    console.error('List fonts error:', error);
    res.status(500).json({ error: 'Failed to list fonts' });
  }
});

// Delete font
app.delete('/api/fonts/:id', authenticateUser, async (req, res) => {
  try {
    const { data: font, error: fetchError } = await supabase
      .from('user_fonts')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !font) {
      return res.status(404).json({ error: 'Font not found' });
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('user_fonts')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (deleteError) throw deleteError;

    // Clean up font file
    await fontService.cleanupFont(req.user.id, req.params.id);

    res.json({
      success: true,
      message: 'Font deleted successfully'
    });

  } catch (error) {
    console.error('Delete font error:', error);
    res.status(500).json({ error: 'Failed to delete font' });
  }
});

// Add the rewrite endpoint
app.post('/api/rewrite', authenticateUser, async (req, res) => {
  try {
    const { text, useOpenAI, model } = req.body;
    if (!text) {
      console.log('Rewrite request rejected: missing text content');
      return res.status(400).json({ error: 'Text content is required' });
    }

    console.log('Processing rewrite request:', {
      textLength: text.length,
      useOpenAI,
      model
    });

    const processedText = await rewriteInChunks(text, req);
    
    console.log('Rewrite processing completed:', {
      originalLength: text.length,
      processedLength: processedText.length,
      model
    });

    res.json({ content: processedText });
  } catch (error) {
    console.error('Error in rewrite endpoint:', {
      error: error.message,
      type: error.name,
      aborted: error.name === 'AbortError'
    });
    res.status(500).json({ error: 'Failed to process text' });
  }
}); 