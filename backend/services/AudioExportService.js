'use strict';

const { createClient } = require('@supabase/supabase-js');
const { EventEmitter } = require('events');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const { ElevenLabsClient } = require('elevenlabs');
const TextExportService = require('./TextExportService'); // Import TextExportService

// Set ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// Directory for temporary files
const TMP_DIR = path.join(__dirname, '..', 'tmp');
fs.ensureDirSync(TMP_DIR); // Ensure the tmp directory exists

class AudioExportService {
  constructor() {
    this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    this.jobs = new Map(); // Stores job status: { id, status, progress, message, error, resultPath }
    this.progressEmitter = new EventEmitter(); // For potential future real-time updates

    console.log("AudioExportService initialized. Temp directory:", TMP_DIR);
  }

  async getUserSettings(userId) {
    console.log(`Fetching settings for user: ${userId}`);
    const { data, error } = await this.supabase
      .from('user_settings')
      .select(`
        elevenlabs_key,
        elevenlabs_model,
        elevenlabs_voice_id,
        voice_stability,
        voice_speaker_boost,
        voice_style,
        voice_similarity_boost
      `)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error("Supabase fetch error details:", error);
      throw new Error('Failed to fetch user settings for audio generation.');
    }
    if (!data) {
      throw new Error('User settings not found for audio generation.');
    }
    if (!data.elevenlabs_key) {
      throw new Error('ElevenLabs API key not configured.');
    }
    if (!data.elevenlabs_voice_id) {
      throw new Error('ElevenLabs Voice ID not configured.');
    }
    
    console.log("Successfully fetched settings for user:", userId);
    return data;
  }

  startAudioGenerationJob(chapters, title, userId) {
    const jobId = uuidv4();
    const jobDir = path.join(TMP_DIR, jobId);
    const finalFileName = `final_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp3`;
    const finalPath = path.join(jobDir, finalFileName);

    const job = {
      id: jobId,
      userId: userId,
      status: 'pending', // pending, processing, completed, failed
      progress: 0, // Percentage or step count
      message: 'Job queued',
      error: null,
      resultPath: finalPath,
      jobDir: jobDir,
      createdAt: new Date()
    };
    this.jobs.set(jobId, job);
    console.log(`Audio generation job queued: ${jobId} for user ${userId}`);

    // Start processing asynchronously
    this._processAudioJob(jobId, chapters, title, userId).catch(err => {
      console.error(`Error processing job ${jobId}:`, err);
      const failedJob = this.jobs.get(jobId);
      if (failedJob) {
        failedJob.status = 'failed';
        failedJob.error = err.message || 'An unknown error occurred during processing.';
        failedJob.message = 'Job failed';
        this.jobs.set(jobId, failedJob);
        // Clean up temporary directory on failure
        fs.remove(jobDir).catch(cleanupErr => console.error(`Error cleaning up dir ${jobDir}:`, cleanupErr));
      }
    });

    return jobId;
  }

  // Main processing function for an audio generation job
  async _processAudioJob(jobId, chapters, title, userId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      console.error(`Job ${jobId} not found for processing.`);
      return;
    }

    const PARAGRAPH_CHUNK_SIZE = 6;
    // CONCURRENCY_LIMIT will be set dynamically based on user tier
    let CONCURRENCY_LIMIT = 3; // Default safe limit
    const allSectionFilePaths = []; // Will store paths in correct order

    try {
      job.status = 'processing';
      job.message = 'Fetching user settings...';
      job.progress = 5; // Initial progress
      this.jobs.set(jobId, job);
      console.log(`Processing job ${jobId}: Fetching settings...`);

      const settings = await this.getUserSettings(userId);

      // --- Dynamically set CONCURRENCY_LIMIT based on ElevenLabs tier ---
      try {
        console.log(`Job ${jobId}: Fetching user subscription tier...`);
        const subResponse = await axios.get('https://api.elevenlabs.io/v1/user/subscription', {
          headers: { 'xi-api-key': settings.elevenlabs_key }
        });
        const tier = subResponse.data?.tier?.toLowerCase(); // Normalize to lowercase
        
        if (tier) {
          switch (tier) {
            case 'free':
            case 'trialing':
              CONCURRENCY_LIMIT = 2;
              break;
            case 'starter':
              CONCURRENCY_LIMIT = 3;
              break;
            case 'creator':
              CONCURRENCY_LIMIT = 5;
              break;
            case 'pro':
              CONCURRENCY_LIMIT = 10;
              break;
            case 'scale':
            case 'business':
            case 'enterprise':
              CONCURRENCY_LIMIT = 15;
              break;
            default:
              console.warn(`Job ${jobId}: Unknown subscription tier "${tier}". Using default concurrency: ${CONCURRENCY_LIMIT}`);
          }
          console.log(`Job ${jobId}: User tier is "${tier}". Setting concurrency limit to ${CONCURRENCY_LIMIT}.`);
        } else {
          console.warn(`Job ${jobId}: Could not determine subscription tier. Using default concurrency: ${CONCURRENCY_LIMIT}`);
        }
      } catch (subError) {
        console.error(`Job ${jobId}: Failed to fetch user subscription info. Using default concurrency ${CONCURRENCY_LIMIT}. Error:`, 
          subError.response?.status || '', subError.message);
        // Keep the default limit if fetching fails
      }
      // --------------------------------------------------------------------

      // Ensure job directory exists
      await fs.ensureDir(job.jobDir);
      console.log(`Processing job ${jobId}: Created job directory ${job.jobDir}`);

      // --- 1. Refine Chapter Text --- 
      console.log(`Job ${jobId}: Starting text refinement phase for ${chapters.length} chapters.`);
      job.message = 'Refining chapter text...';
      job.progress = 10; // Start refinement progress after settings/tier check
      this.jobs.set(jobId, job);

      const refinedChapters = [];
      // Calculate total chapters that actually need refining
      const totalChaptersToRefine = chapters.filter(ch => ch.content && ch.content.trim().length > 0).length;
      let refinedChaptersCount = 0;

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        const chapterIndex = i;
        console.log(`Job ${jobId}: Processing Chapter ${chapterIndex + 1}/${chapters.length} for refinement.`);
        // Progress calculation remains based on total chapters to ensure smooth bar filling
        job.progress = Math.round(10 + ((i + 1) / chapters.length) * 20); 
        // Set a generic message initially for the chapter
        job.message = `Processing chapter ${chapterIndex + 1}/${chapters.length} for refinement...`;
        this.jobs.set(jobId, { ...job });

        // Check if chapter content is empty or just whitespace
        if (!chapter.content || chapter.content.trim().length === 0) {
          console.log(`Job ${jobId}: Skipping refinement for Chapter ${chapterIndex + 1} (empty content).`);
          // Add the original chapter (with empty content) directly
          refinedChapters.push({ ...chapter }); 
          continue; // Move to the next chapter
        }

        try {
          const refinedContent = await TextExportService.rewriteInChunks(
            chapter.content,
            userId,
            jobId // Use jobId as sessionId for potential tracking in TextExportService
          );
          // Store the refined chapter content
          refinedChapters.push({ ...chapter, content: refinedContent }); 
          refinedChaptersCount++; // Increment count *after* successful refinement
          // Update message to reflect refined count
          job.message = `Refining text: ${refinedChaptersCount}/${totalChaptersToRefine} chapters completed.`;
          this.jobs.set(jobId, { ...job }); // Update job state with new message
          console.log(`Job ${jobId}: Successfully refined Chapter ${chapterIndex + 1}. (${refinedChaptersCount}/${totalChaptersToRefine} refined)`);
        } catch (refineError) {
          console.error(`Job ${jobId}: Error refining Chapter ${chapterIndex + 1}:`, refineError);
          throw new Error(`Failed to refine text for Chapter ${chapterIndex + 1}: ${refineError.message}`);
        }
      }
      console.log(`Job ${jobId}: Text refinement phase complete.`);
      // --- End Refinement ---

      // --- 2. Flatten all sections (using refined chapters) --- 
      const sectionsToProcess = [];
      let globalSectionIndex = 0;
      for (let i = 0; i < refinedChapters.length; i++) { // Use refinedChapters here
        const chapter = refinedChapters[i]; // Use refined chapter
        const chapterIndex = i;
        // Split refined chapter content into paragraphs
        const paragraphs = chapter.content.split(/\n\n+/).filter(p => p.trim().length > 0);
        
        for (let j = 0; j < paragraphs.length; j += PARAGRAPH_CHUNK_SIZE) {
          const sectionParagraphs = paragraphs.slice(j, j + PARAGRAPH_CHUNK_SIZE);
          const sectionText = sectionParagraphs.join('\n\n');
          const sectionIndex = Math.floor(j / PARAGRAPH_CHUNK_SIZE); // Index within the chapter
          const sectionFilePath = path.join(job.jobDir, `chapter_${chapterIndex}_section_${sectionIndex}.mp3`);
          
          sectionsToProcess.push({
            chapterIndex,
            sectionIndex,
            globalIndex: globalSectionIndex++,
            text: sectionText,
            filePath: sectionFilePath
          });
        }
      }
      
      const totalSections = sectionsToProcess.length;
      if (totalSections === 0 && chapters.length > 0) {
        throw new Error('Chapters found, but no processable sections detected.');
      }
      if (totalSections === 0 && chapters.length === 0) {
          console.warn(`Job ${jobId}: No chapters provided, creating empty output.`);
          job.status = 'completed';
          job.progress = 100;
          job.message = 'No content to generate.';
          await fs.writeFile(job.resultPath, ''); // Create an empty file
          this.jobs.set(jobId, job);
          return; // Nothing more to do
      }

      console.log(`Job ${jobId}: Found ${totalSections} sections across ${chapters.length} chapters. Processing with concurrency ${CONCURRENCY_LIMIT}.`);
      job.message = `Preparing ${totalSections} audio sections...`;
      job.progress = 10;
      this.jobs.set(jobId, job);

      // --- 2. Process sections concurrently with limit ---
      let completedSections = 0;
      const sectionResults = new Array(totalSections).fill(null); // Array to store results in order
      const activePromises = new Set();
      let sectionCursor = 0;

      const processNextSection = async () => {
        if (sectionCursor >= totalSections) {
          return; // All sections initiated
        }

        const section = sectionsToProcess[sectionCursor];
        sectionCursor++; // Move cursor immediately

        const promise = this._generateSectionAudio(
          section.text,
          settings,
          jobId,
          section.chapterIndex,
          section.sectionIndex,
          section.filePath
        ).then(() => {
            // Success
            completedSections++;
            sectionResults[section.globalIndex] = section.filePath; // Store path at the correct global index
            // Calculate progress within the audio generation phase (e.g., 30% to 95%)
            job.progress = Math.round(30 + (completedSections / totalSections) * 65); 
            job.message = `Generating audio: Section ${completedSections}/${totalSections} completed.`;
            this.jobs.set(jobId, { ...job }); // Update job state (use spread to ensure reactivity if needed)
            console.log(`Job ${jobId}: Section ${section.globalIndex + 1}/${totalSections} (C${section.chapterIndex+1} S${section.sectionIndex+1}) completed successfully.`);
            activePromises.delete(promise); // Remove completed promise
        }).catch(err => {
            // Failure - Propagate the error to fail the entire job
            console.error(`Job ${jobId}: FATAL ERROR in Section ${section.globalIndex + 1}/${totalSections} (C${section.chapterIndex+1} S${section.sectionIndex+1}):`, err);
            activePromises.delete(promise); // Remove failed promise
            // Re-throw the error to be caught by the main Promise.all/race logic
            throw new Error(`Failed processing section C${section.chapterIndex+1} S${section.sectionIndex+1}: ${err.message}`); 
        });

        activePromises.add(promise);

        // If the pool is full, wait for one promise to settle before adding more
        if (activePromises.size >= CONCURRENCY_LIMIT) {
            await Promise.race(activePromises); // Wait for the *next* promise to finish (success or fail)
        }
        
        // Recursively call to process the next section if available
        await processNextSection(); 
      };

      // Start the initial batch of promises
      const initialPromises = [];
      for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, totalSections); i++) {
          initialPromises.push(processNextSection());
      }
      
      // Wait for all processing chains to complete
      await Promise.all(initialPromises);
      
      // Final check: Wait for any remaining active promises (should be less than CONCURRENCY_LIMIT)
      await Promise.all(Array.from(activePromises));

      // --- 3. Final Concatenation --- 
      // At this point, all sections should have succeeded if no error was thrown
      if (completedSections !== totalSections) {
          // This case should ideally be prevented by the error throwing in processNextSection
          throw new Error(`Job ${jobId}: Mismatch in completed sections. Expected ${totalSections}, got ${completedSections}.`);
      }
      
      // Filter out any potential nulls (shouldn't happen with current logic) and ensure files exist
      const finalSectionPaths = [];
      for (const filePath of sectionResults) {
          if (filePath && await fs.pathExists(filePath)) {
              finalSectionPaths.push(filePath);
          } else {
              console.warn(`Job ${jobId}: Expected section file not found or null: ${filePath}. Skipping in concatenation.`);
              // Optionally, throw an error here if missing files are critical
          }
      }

      if (finalSectionPaths.length === 0) {
        throw new Error(`Job ${jobId}: No section audio files were successfully generated or found for concatenation.`);
      }

      console.log(`Job ${jobId}: All ${totalSections} sections generated. Concatenating ${finalSectionPaths.length} files into final output: ${job.resultPath}`);
      job.message = 'Finalizing audio file...';
      job.progress = 95;
      this.jobs.set(jobId, job);

      await this._concatenateFiles(finalSectionPaths, job.resultPath, job.jobDir);
      console.log(`Job ${jobId}: Final audio file saved to ${job.resultPath}`);

      // --- 4. Cleanup --- 
      console.log(`Job ${jobId}: Cleaning up ${finalSectionPaths.length} section files and silence file.`);
      const silenceFilePath = path.join(job.jobDir, 'silence.mp3');
      const filesToRemove = [...finalSectionPaths, silenceFilePath];
      // Use Promise.allSettled for cleanup to avoid one failure stopping others
      const cleanupResults = await Promise.allSettled(filesToRemove.map(filePath => 
          fs.pathExists(filePath).then(exists => exists ? fs.remove(filePath) : null)
      ));
      cleanupResults.forEach((result, index) => {
          if (result.status === 'rejected') {
              console.warn(`Job ${jobId}: Could not remove temp file ${filesToRemove[index]}:`, result.reason);
          }
      });

      // --- Final Success --- 
      job.status = 'completed';
      job.progress = 100;
      job.message = 'Audio generation complete.';
      this.jobs.set(jobId, job);
      console.log(`Job ${jobId} completed successfully.`);

    } catch (error) {
      // --- Global Error Handling --- 
      console.error(`Error processing job ${jobId}:`, error);
      const currentJobState = this.jobs.get(jobId) || {}; // Get current state before overwriting
      currentJobState.status = 'failed';
      currentJobState.error = error.message || 'Processing failed due to an unknown error.';
      // Ensure message reflects the actual error
      currentJobState.message = `Job failed: ${error.message}`; 
      this.jobs.set(jobId, currentJobState);

      // Clean up temporary directory on error
      console.error(`Job ${jobId} failed. Cleaning up directory: ${job.jobDir}`);
      await fs.remove(job.jobDir).catch(cleanupErr => console.error(`Error cleaning up directory ${job.jobDir} after failure:`, cleanupErr));
      // Don't re-throw here, error is logged and status is set
    }
  }

  // Generates audio for a single text section using ElevenLabs API and saves it to a file
  async _generateSectionAudio(sectionText, settings, jobId, chapterIndex, sectionIndex, sectionFilePath, maxRetries = 5) {
    const {
        elevenlabs_key: apiKey,
        elevenlabs_voice_id: voiceId,
        elevenlabs_model: modelId = 'eleven_multilingual_v2', // Default model
        voice_stability: stability,
        voice_similarity_boost: similarityBoost,
        voice_style: style,
        voice_speaker_boost: useSpeakerBoost
    } = settings;

    console.log(`Job ${jobId}: Attempting audio generation for Chapter ${chapterIndex + 1}, Section ${sectionIndex + 1} -> ${path.basename(sectionFilePath)}`);

    // Prepare voice settings object (only include defined values)
    const voiceSettings = {};
    if (stability !== undefined && stability !== null) voiceSettings.stability = stability;
    if (similarityBoost !== undefined && similarityBoost !== null) voiceSettings.similarity_boost = similarityBoost;
    if (style !== undefined && style !== null) voiceSettings.style = style;
    if (useSpeakerBoost !== undefined && useSpeakerBoost !== null) voiceSettings.use_speaker_boost = useSpeakerBoost;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Initialize ElevenLabs client with API key
        const client = new ElevenLabsClient({ apiKey });

        console.log(`Job ${jobId}: Calling ElevenLabs API (Attempt ${attempt}) for Chapter ${chapterIndex + 1}, Section ${sectionIndex + 1}`);

        // Use the client library as requested
        const audioResponse = await client.textToSpeech.convert(voiceId, {
          output_format: "mp3_44100_192", // Higher quality 192kbps
          text: sectionText,
          model_id: modelId,
          ...(Object.keys(voiceSettings).length > 0 && { voice_settings: voiceSettings })
        });

        console.log(`Job ${jobId}: Received response from ElevenLabs API for Chapter ${chapterIndex + 1}, Section ${sectionIndex + 1}, type: ${typeof audioResponse}`);

        // Handle the response based on its type
        if (!audioResponse) {
          throw new Error('ElevenLabs API returned empty response');
        } 
        // --- Stream Handling ---
        else if (typeof audioResponse.pipe === 'function') {
          // Node.js Stream - Pipe directly to file
          console.log(`Job ${jobId}: Response is a Node.js Stream. Piping to ${path.basename(sectionFilePath)}`);
          await new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(sectionFilePath);
            
            // Handle errors on the ElevenLabs stream
            audioResponse.on('error', (err) => {
              console.error(`Job ${jobId}: Error during ElevenLabs stream read:`, err);
              fileStream.close(); // Close the file stream on read error
              fs.unlink(sectionFilePath, () => {}); // Attempt to delete incomplete file
              reject(new Error(`ElevenLabs stream error: ${err.message}`));
            });

            // Handle errors on the file write stream
            fileStream.on('error', (err) => {
              console.error(`Job ${jobId}: Error writing audio file ${path.basename(sectionFilePath)}:`, err);
              reject(new Error(`File write error: ${err.message}`));
            });
            
            // Handle successful completion of the pipe
            fileStream.on('finish', () => {
              console.log(`Job ${jobId}: Successfully piped stream to ${path.basename(sectionFilePath)}`);
              resolve(); // Resolve the promise once file writing is complete
            });
            
            // Start piping
            audioResponse.pipe(fileStream);
          });
        } 
        // --- Buffer Handling (Keep for potential non-stream responses) ---
        else if (Buffer.isBuffer(audioResponse)) {
          console.log(`Job ${jobId}: Response is a Buffer (${audioResponse.length} bytes). Writing to ${path.basename(sectionFilePath)}`);
          if (audioResponse.length === 0) throw new Error('Generated audio buffer is empty');
          await fs.writeFile(sectionFilePath, audioResponse);
        } else if (audioResponse instanceof ArrayBuffer || audioResponse instanceof Uint8Array) {
          console.log(`Job ${jobId}: Response is an ArrayBuffer/Uint8Array (${audioResponse.byteLength} bytes). Writing to ${path.basename(sectionFilePath)}`);
          const buffer = Buffer.from(audioResponse);
          if (buffer.length === 0) throw new Error('Generated audio buffer is empty');
          await fs.writeFile(sectionFilePath, buffer);
        } else if (typeof audioResponse === 'string') {
           console.log(`Job ${jobId}: Response is a string (${audioResponse.length} chars). Writing to ${path.basename(sectionFilePath)}`);
           const buffer = Buffer.from(audioResponse);
           if (buffer.length === 0) throw new Error('Generated audio buffer is empty');
           await fs.writeFile(sectionFilePath, buffer);
        } else if (typeof audioResponse === 'object' && audioResponse.constructor && audioResponse.constructor.name === 'ReadableStream') {
          // Handle modern browser ReadableStream (might occur in some environments, convert to buffer)
          console.log(`Job ${jobId}: Response is a ReadableStream. Buffering...`);
          const reader = audioResponse.getReader();
          const chunks = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const buffer = Buffer.concat(chunks);
          console.log(`Job ${jobId}: Collected ${chunks.length} chunks from ReadableStream (${buffer.length} bytes). Writing to ${path.basename(sectionFilePath)}`);
          if (buffer.length === 0) throw new Error('Generated audio buffer is empty');
          await fs.writeFile(sectionFilePath, buffer);
        } else {
          // Unknown type
          console.error(`Job ${jobId}: Received unexpected response type:`, {
            type: typeof audioResponse,
            constructor: audioResponse.constructor?.name,
          });
          throw new Error(`Unsupported response type from ElevenLabs: ${typeof audioResponse} / ${audioResponse.constructor?.name}`);
        }

        // Check if file was actually created and has size
        const stats = await fs.stat(sectionFilePath);
        if (stats.size === 0) {
            throw new Error(`Generated audio file ${path.basename(sectionFilePath)} is empty after processing response type ${typeof audioResponse}.`);
        }

        console.log(`Job ${jobId}: Successfully saved audio for Chapter ${chapterIndex + 1}, Section ${sectionIndex + 1} to ${path.basename(sectionFilePath)} (${stats.size} bytes)`);
        return; // Successful generation

      } catch (error) {
        console.error(`Job ${jobId}: Error generating audio (Attempt ${attempt}/${maxRetries}) for Chapter ${chapterIndex + 1}, Section ${sectionIndex + 1}:`, 
          error.response?.status || '', error.message);
        
        // Try cleaning up potentially incomplete file on error
        fs.pathExists(sectionFilePath)
          .then(exists => {
              if (exists) fs.unlink(sectionFilePath, () => {});
          }).catch(()=>{}); // Ignore unlink errors

        // Determine if error is retryable
        const isRetryable = 
          error.message.includes('timeout') || 
          error.message.includes('network') ||
          error.message.includes('stream error') || // Added stream error
          error.message.includes('File write error') || // Added file write error
          (error.response && (error.response.status === 429 || error.response.status >= 500));

        if (isRetryable && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff (2s, 4s, 8s...)
          console.log(`Job ${jobId}: Retrying in ${delay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Handle non-retryable errors or max retries exceeded
          let errorMessage = `Failed to generate audio for Chapter ${chapterIndex + 1}, Section ${sectionIndex + 1} after ${maxRetries} attempts.`;
          
          if (error.response?.data) {
            try {
              // Try to extract error details
              const errorData = Buffer.isBuffer(error.response.data) 
                ? Buffer.from(error.response.data).toString()
                : error.response.data;
                
              // Try to parse as JSON if it's a string
              const errorDetails = typeof errorData === 'string' && errorData.startsWith('{')
                ? JSON.parse(errorData)
                : errorData;
              
              errorMessage += ` Error: ${errorDetails.detail || errorDetails.message || JSON.stringify(errorDetails)}`;
            } catch (parseError) {
              errorMessage += ` Status: ${error.response?.status || ''} - ${error.response?.statusText || error.message}`;
            }
          } else {
            errorMessage += ` Error: ${error.message}`;
          }
          
          console.error(errorMessage);
          throw new Error(errorMessage);
        }
      }
    }

    // Should not be reached if retries fail, as error is thrown
    throw new Error(`Audio generation failed unexpectedly after ${maxRetries} retries for ${path.basename(sectionFilePath)}.`);
  }

  // Concatenates audio files using ffmpeg, adding silence between them
  async _concatenateFiles(inputFilePaths, outputPath, jobDir, silenceDuration = 0.4) {
    if (!inputFilePaths || inputFilePaths.length === 0) {
      throw new Error('No input files provided for concatenation.');
    }
    if (inputFilePaths.length === 1) {
        // If only one file, just copy it to the output path
        console.log(`Only one file provided, copying ${inputFilePaths[0]} to ${outputPath}`);
        await fs.copy(inputFilePaths[0], outputPath);
        return;
    }

    console.log(`Concatenating ${inputFilePaths.length} files to ${outputPath} with ${silenceDuration}s silence.`);
    const silenceFilePath = path.join(jobDir, 'silence.mp3');
    const fileListPath = path.join(jobDir, 'concat_list.txt');

    return new Promise(async (resolve, reject) => {
      try {
        // 1. Generate silence file if needed (and doesn't exist)
        if (!await fs.pathExists(silenceFilePath)) {
            await this._generateSilenceFile(silenceFilePath, silenceDuration);
        }

        // 2. Create the ffmpeg concat demuxer file list
        let fileListContent = '';
        for (let i = 0; i < inputFilePaths.length; i++) {
          const filePath = inputFilePaths[i];
          // Ensure file exists before adding to list
          if (!await fs.pathExists(filePath)) {
              throw new Error(`Input file not found during concatenation: ${filePath}`);
          }
          // Note: Need to escape special characters in filenames for ffmpeg file list
          const escapedPath = filePath.replace(/\\/g, '/').replace(/\'/g, "'\\\''"); 
          fileListContent += `file '${escapedPath}'\n`;
          // Add silence file after each input file except the last one
          if (i < inputFilePaths.length - 1) {
            const escapedSilencePath = silenceFilePath.replace(/\\/g, '/').replace(/\'/g, "'\\\''");
            fileListContent += `file '${escapedSilencePath}'\n`;
          }
        }
        await fs.writeFile(fileListPath, fileListContent);

        // 3. Run ffmpeg command
        ffmpeg()
          .input(fileListPath)
          .inputOptions(['-f', 'concat', '-safe', '0']) // Use concat demuxer, safe 0 allows relative paths
          .outputOptions(['-c', 'copy']) // Copy codecs to avoid re-encoding (faster)
          .output(outputPath)
          .on('start', (commandLine) => {
            console.log('FFmpeg command: ' + commandLine);
          })
          .on('end', async () => {
            console.log(`Successfully concatenated files to ${outputPath}`);
            // Clean up concat list file
            await fs.remove(fileListPath).catch(err => console.warn(`Could not remove concat list ${fileListPath}:`, err));
            resolve();
          })
          .on('error', async (err, stdout, stderr) => {
            console.error(`Error concatenating files: ${err.message}`);
            console.error('FFmpeg stderr:', stderr);
            // Clean up concat list file on error
            await fs.remove(fileListPath).catch(listErr => console.warn(`Could not remove concat list ${fileListPath} on error:`, listErr));
            reject(new Error(`FFmpeg concatenation failed: ${err.message}`));
          })
          .run();

      } catch (error) {
        console.error("Error during concatenation setup:", error);
        // Clean up potentially created list file
        if (await fs.pathExists(fileListPath)) {
            await fs.remove(fileListPath).catch(listErr => console.warn(`Could not remove concat list ${fileListPath} on error:`, listErr));
        }
        reject(error);
      }
    });
  }

  // Helper to generate a silent MP3 file
  async _generateSilenceFile(outputPath, duration) {
    return new Promise((resolve, reject) => {
        console.log(`Generating silence file (${duration}s) at: ${outputPath}`);
        ffmpeg()
          .input('anullsrc=channel_layout=stereo:sample_rate=44100') // Use anullsrc filter
          .inputOptions(['-f', 'lavfi']) // Specify input format as lavfi
          .duration(duration)
          .audioCodec('libmp3lame') // Specify MP3 codec
          .audioBitrate('128k') // Specify bitrate
          .output(outputPath)
          .on('end', () => {
            console.log('Silence file generated successfully.');
            resolve();
          })
          .on('error', (err, stdout, stderr) => {
            console.error(`Error generating silence file: ${err.message}`);
            console.error('FFmpeg stderr:', stderr);
            reject(new Error(`Failed to generate silence file: ${err.message}`));
          })
          .run();
    });
  }
  
  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }
    // Return a copy of the job status, excluding sensitive/internal info if needed
    return { 
        id: job.id,
        status: job.status,
        progress: job.progress,
        message: job.message,
        error: job.error 
    };
  }

  getJobResultPath(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'completed') {
        return null; // Or throw an error if preferred
    }
    return job.resultPath;
  }
  
  // Cleanup old jobs (optional - could run periodically)
  cleanupOldJobs(maxAgeMinutes = 60) {
      const now = new Date();
      for (const [jobId, job] of this.jobs.entries()) {
          const jobAgeMinutes = (now - job.createdAt) / (1000 * 60);
          if (jobAgeMinutes > maxAgeMinutes) {
              console.log(`Cleaning up old job ${jobId}`);
              fs.remove(job.jobDir).catch(err => console.error(`Error cleaning up dir for old job ${jobId}:`, err));
              this.jobs.delete(jobId);
          }
      }
  }
}

module.exports = new AudioExportService();