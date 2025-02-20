const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { Configuration, OpenAIApi } = require('openai');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const userSettingsService = require('./services/UserSettingsService');

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
  writeScene
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
  charactersFn: typeof charactersFn
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
  'http://localhost:3000',
  'https://plotter-palette.vercel.app',
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
    
    // Check for required API keys based on the endpoint
    const endpoint = req.path;
    if (endpoint.includes('/stories/write-scene') && !settings.openrouter_key) {
      return res.status(400).json({ error: 'OpenRouter API key not configured' });
    }
    if ((endpoint.includes('/stories/initialize') || endpoint.includes('/stories/title')) && !settings.openai_key) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }

    // Initialize OpenRouter client for scene generation
    const openRouter = new OpenAI({
      apiKey: settings.openrouter_key,
      baseURL: "https://openrouter.ai/api/v1"
    });

    // Initialize OpenAI client for story ideas and titles
    const openai = new OpenAI({
      apiKey: settings.openai_key
    });

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

  console.log('Scene generation started:', {
    clientId,
    sceneBeat,
    previousScenesCount: previousScenes.length
  });

  if (!clientId || !sceneBeat || !characters) {
    console.log('Missing required fields:', { clientId, sceneBeat, characters });
    return res.status(400).json({ 
      error: 'Missing required fields: clientId, sceneBeat, characters' 
    });
  }

  try {
    // Get the abort controller for this client
    const controller = abortControllers.get(clientId);
    const signal = controller ? controller.signal : null;

    // Check if the request has been aborted
    if (signal?.aborted) {
      console.log('Scene generation cancelled for client:', clientId);
      throw new Error('Scene generation cancelled');
    }

    console.log('Generating scene with:', {
      sceneBeat,
      charactersLength: characters.length,
      previousScenesCount: previousScenes.length
    });

    // Create a callback function for partial updates
    const onProgress = (partialContent) => {
      sendProgressUpdate(clientId, { content: partialContent, isPartial: true });
    };

    // Write the scene using the story.js module with progress callback
    const scene = await writeScene(
      sceneBeat,
      characters,
      previousScenes.length,
      previousScenes.length + 1,
      previousScenes,
      onProgress,
      req // Pass the request object here
    );

    console.log('Scene generated successfully:', {
      clientId,
      sceneLength: scene.length,
      scenePreview: scene.substring(0, 200) + '...'
    });

    // Send the final scene content
    sendProgressUpdate(clientId, { content: scene, isPartial: false });

    // Clean up
    const client = progressClients.get(clientId);
    if (client) {
      client.end();
      progressClients.delete(clientId);
    }
    abortControllers.delete(clientId);

    res.json({ success: true });
  } catch (error) {
    console.error('Scene generation error:', {
      clientId,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to generate scene' 
    });

    // Clean up on error
    const client = progressClients.get(clientId);
    if (client) {
      client.end();
      progressClients.delete(clientId);
    }
    abortControllers.delete(clientId);
  }
});

// Add endpoint for scene revision based on feedback
app.post('/api/stories/revise-scene', authenticateUser, async (req, res) => {
  const { clientId, sceneBeat, characters, currentScene, feedback } = req.body;

  if (!clientId || !sceneBeat || !characters || !currentScene || !feedback) {
    return res.status(400).json({ 
      error: 'Missing required fields: clientId, sceneBeat, characters, currentScene, feedback' 
    });
  }

  try {
    // Get the abort controller for this client
    const controller = abortControllers.get(clientId);
    const signal = controller ? controller.signal : null;

    // Check if the request has been aborted
    if (signal?.aborted) {
      throw new Error('Scene revision cancelled');
    }

    // Create a callback function for partial updates
    const onProgress = (partialContent) => {
      sendProgressUpdate(clientId, { content: partialContent, isPartial: true });
    };

    // Construct the revision prompt
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

    // Generate the revised scene
    const response = await openai.chat.completions.create({
      model: process.env.OAI_MODEL || 'gpt-4',
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

    // Clean up
    const client = progressClients.get(clientId);
    if (client) {
      client.end();
      progressClients.delete(clientId);
    }
    abortControllers.delete(clientId);

    res.json({ success: true });
  } catch (error) {
    console.error('Scene revision error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to revise scene' 
    });

    // Clean up on error
    const client = progressClients.get(clientId);
    if (client) {
      client.end();
      progressClients.delete(clientId);
    }
    abortControllers.delete(clientId);
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
  const controller = abortControllers.get(clientId);
  const signal = controller ? controller.signal : null;

  try {
    // Check if the request has been aborted
    if (signal?.aborted) {
      console.log(`Story generation already cancelled for client ${clientId}`);
      throw new Error('Story generation cancelled');
    }

    let isAborted = false;
    // Add signal check to abort immediately if cancelled
    signal?.addEventListener('abort', () => {
      console.log(`Story generation aborted for client ${clientId}`);
      isAborted = true;
    });

    // Generate a unique UUID for the story
    const storyId = uuidv4();

    // Generate story idea
    sendProgressUpdate(clientId, 0);
    console.log("Step 1: Generating story idea...");
    try {
      const storyIdea = await storyIdeas(req);
      if (!storyIdea) {
        throw new Error('Failed to generate story idea');
      }
      console.log("Story idea generated successfully");

      // Generate title
      sendProgressUpdate(clientId, 1);
      console.log("Step 2: Creating title...");
      const title = await createTitle(storyIdea, req);
      if (!title) {
        throw new Error('Failed to generate title');
      }
      console.log("Title created successfully");

      // Create outline
      sendProgressUpdate(clientId, 2);
      console.log("Step 3: Building plot outline...");
      const outline = await createOutline(storyIdea, req);
      if (!outline) {
        throw new Error('Failed to create outline');
      }
      console.log("Outline created successfully");

      // Generate characters
      sendProgressUpdate(clientId, 3);
      console.log("Step 4: Developing characters...");
      const characters = await charactersFn(outline, req);
      if (!characters) {
        throw new Error('Failed to generate characters');
      }
      console.log("Characters generated successfully");

      // Save to database
      sendProgressUpdate(clientId, 4);
      console.log("Step 5: Saving story...");
      
      // Only save to database if the generation wasn't cancelled
      if (isAborted) {
        throw new Error('Story generation cancelled');
      }

      const { data, error } = await supabase
        .from('stories')
        .insert([{
          id: storyId, // Use UUID v4 instead of clientId
          user_id: req.user.id,
          title: title,
          story_idea: storyIdea,
          plot_outline: JSON.stringify(outline),
          characters: characters,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log("Story saved successfully");

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
      console.error('Story initialization error:', error);
      // Close the SSE connection on error
      const client = progressClients.get(clientId);
      if (client) {
        client.end();
        progressClients.delete(clientId);
      }
      // Clean up the abort controller
      abortControllers.delete(clientId);

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } catch (error) {
    console.error('Story initialization error:', error);
    // Close the SSE connection on error
    const client = progressClients.get(clientId);
    if (client) {
      client.end();
      progressClients.delete(clientId);
    }
    // Clean up the abort controller
    abortControllers.delete(clientId);

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