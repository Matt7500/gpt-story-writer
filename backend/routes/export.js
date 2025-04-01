const express = require('express');
const router = express.Router();
const textExportService = require('../services/TextExportService');

// SSE endpoint for progress updates
router.get('/text/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.id;

  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Send initial connection established message
  res.write('data: {"type":"connected"}\n\n');

  // Create progress handler
  const progressHandler = (data) => {
    // Only send progress to the correct user
    if (data.userId === userId) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  // Subscribe to progress updates
  textExportService.subscribeToProgress(sessionId, progressHandler);

  // Handle client disconnect
  req.on('close', () => {
    textExportService.unsubscribeFromProgress(sessionId, progressHandler);
  });
});

// Export endpoint
router.post('/text', async (req, res) => {
  try {
    const { chapters, title } = req.body;
    const userId = req.user.id;

    if (!chapters || !Array.isArray(chapters)) {
      return res.status(400).json({ error: 'Invalid chapters data' });
    }

    const { content, sessionId } = await textExportService.exportAsText(
      chapters,
      title,
      userId
    );

    res.json({ 
      success: true, 
      sessionId,
      content 
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ 
      error: 'Export failed', 
      details: error.message 
    });
  }
});

module.exports = router; 