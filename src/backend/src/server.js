const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { Configuration, OpenAIApi } = require('openai');
const path = require('path');

// Load environment variables from the root directory
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Initialize OpenAI client and story module
const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey: process.env.OAI_API_KEY,
});
global.oaiClient = openai; // Make it available globally for story.js

const { 
  storyIdeas, 
  createTitle, 
  createOutline, 
  charactersFn,
  initializeClients 
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
  'SUPABASE_ANON_KEY',
  'OAI_API_KEY',
  'OR_API_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const app = express();
const port = process.env.PORT || 3001;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key:', supabaseKey ? 'Present' : 'Missing');

const supabase = createClient(supabaseUrl, supabaseKey);

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:8080',
  process.env.FRONTEND_URL
].filter(Boolean); // Remove any undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Middleware to verify Supabase session
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

    req.user = user;
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
const sendProgressUpdate = (clientId, step) => {
  const client = progressClients.get(clientId);
  if (client) {
    client.write(`data: ${JSON.stringify({ step })}\n\n`);
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

    // Generate story idea
    sendProgressUpdate(clientId, 0);
    console.log("Step 1: Generating story idea...");
    const storyIdea = await storyIdeas();
    if (!storyIdea || isAborted) {
      throw new Error(isAborted ? 'Story generation cancelled' : 'Failed to generate story idea');
    }
    console.log("Story idea generated successfully");

    // Generate title
    sendProgressUpdate(clientId, 1);
    console.log("Step 2: Creating title...");
    const title = await createTitle(storyIdea, process.env.OAI_MODEL);
    if (!title || isAborted) {
      throw new Error(isAborted ? 'Story generation cancelled' : 'Failed to generate title');
    }
    console.log("Title created successfully");

    // Create outline
    sendProgressUpdate(clientId, 2);
    console.log("Step 3: Building plot outline...");
    const outline = await createOutline(storyIdea);
    if (!outline || isAborted) {
      throw new Error(isAborted ? 'Story generation cancelled' : 'Failed to create outline');
    }
    console.log("Outline created successfully");

    // Generate characters
    sendProgressUpdate(clientId, 3);
    console.log("Step 4: Developing characters...");
    const characters = await charactersFn(outline);
    if (!characters || isAborted) {
      throw new Error(isAborted ? 'Story generation cancelled' : 'Failed to generate characters');
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
        id: clientId, // Use the clientId as the story ID
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