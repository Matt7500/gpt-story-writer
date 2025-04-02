'use strict';

const express = require('express');
const router = express.Router();
const textExportService = require('../services/TextExportService');
const audioExportService = require('../services/AudioExportService');
const path = require('path');
const fs = require('fs');

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

// POST /api/export/audio - Start audio generation job
router.post('/audio', async (req, res, next) => {
  const { chapters, title } = req.body;
  const userId = req.user.id; // Assuming authenticateUser middleware adds user object to req

  if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
    return res.status(400).json({ error: 'Invalid chapters data' });
  }
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Invalid title' });
  }

  try {
    console.log(`Received /audio request from user ${userId} for title: ${title}`);
    const jobId = audioExportService.startAudioGenerationJob(chapters, title, userId);
    console.log(`Job ${jobId} started for user ${userId}.`);
    res.status(202).json({ jobId }); // Accepted for processing
  } catch (error) {
    console.error('Error starting audio job:', error);
    // Check for specific configuration errors from getUserSettings
    if (error.message.includes('ElevenLabs') || error.message.includes('User settings')) {
        return res.status(400).json({ error: `Configuration Error: ${error.message}` });
    }
    res.status(500).json({ error: 'Failed to start audio generation job' });
  }
});

// GET /api/export/audio/status/:jobId - Get job status
router.get('/audio/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.id;

  console.log(`Received /audio/status request for job ${jobId} from user ${userId}`);
  const jobStatus = audioExportService.getJobStatus(jobId);

  if (!jobStatus) {
    console.log(`Job ${jobId} not found for status request.`);
    return res.status(404).json({ error: 'Job not found' });
  }

  // Optional: Add check to ensure the user requesting status owns the job
  // if (jobStatus.userId !== userId) {
  //   return res.status(403).json({ error: 'Forbidden' });
  // }

  console.log(`Returning status for job ${jobId}:`, jobStatus.status);
  res.status(200).json(jobStatus);
});

// GET /api/export/audio/result/:jobId - Download the final audio file
router.get('/audio/result/:jobId', (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.id;

  console.log(`Received /audio/result request for job ${jobId} from user ${userId}`);
  const jobStatus = audioExportService.getJobStatus(jobId); // Check status first

  if (!jobStatus) {
    console.log(`Job ${jobId} not found for result request.`);
    return res.status(404).json({ error: 'Job not found' });
  }

  // Optional: Check ownership
  // if (jobStatus.userId !== userId) {
  //   return res.status(403).json({ error: 'Forbidden' });
  // }

  if (jobStatus.status === 'failed') {
    console.log(`Job ${jobId} failed, cannot provide result.`);
    return res.status(400).json({ error: 'Audio generation failed', details: jobStatus.error });
  }

  if (jobStatus.status !== 'completed') {
    console.log(`Job ${jobId} not completed yet (status: ${jobStatus.status}).`);
    return res.status(400).json({ error: 'Audio generation not complete yet' });
  }

  const resultPath = audioExportService.getJobResultPath(jobId);

  if (!resultPath) {
      console.error(`Result path not found for completed job ${jobId}`);
      return res.status(404).json({ error: 'Result file not found, even though job completed.' });
  }

  // Check if file exists before sending
  if (fs.existsSync(resultPath)) {
    console.log(`Sending result file for job ${jobId}: ${resultPath}`);
    const fileName = path.basename(resultPath);
    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.sendFile(resultPath, (err) => {
      if (err) {
        console.error(`Error sending file ${resultPath}:`, err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error sending the audio file.' });
        }
      }
      // Optionally clean up the file/directory after sending, 
      // but might be better to do via periodic cleanup in the service
    });
  } else {
    console.error(`Result file ${resultPath} does not exist for job ${jobId}.`);
    res.status(404).json({ error: 'Result file not found on server.' });
  }
});

module.exports = router; 