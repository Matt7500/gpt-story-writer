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
    const chapterFilePaths = [];
    const totalChapters = chapters.length;
    let overallProgress = 0; // Track progress across all chapters

    try {
      job.status = 'processing';
      job.message = 'Fetching user settings...';
      job.progress = 5; // Initial progress
      this.jobs.set(jobId, job);
      console.log(`Processing job ${jobId}: Fetching settings...`);

      const settings = await this.getUserSettings(userId);
      
      // Ensure job directory exists
      await fs.ensureDir(job.jobDir);
      console.log(`Processing job ${jobId}: Created job directory ${job.jobDir}`);

      // --- Chapter Processing Loop --- 
      for (let i = 0; i < totalChapters; i++) {
        const chapter = chapters[i];
        const chapterIndex = i;
        const chapterTitle = chapter.title || `Chapter ${i + 1}`;
        const chapterFilePath = path.join(job.jobDir, `chapter_${i}.mp3`);
        const sectionFilePaths = [];
        let sectionIndex = 0;

        console.log(`Job ${jobId}: Starting Chapter ${chapterIndex + 1} - ${chapterTitle}`);
        job.message = `Processing Chapter ${chapterIndex + 1}/${totalChapters}: ${chapterTitle}`;
        // Calculate base progress for this chapter start
        const chapterStartProgress = 10 + (i / totalChapters) * 80; // Allocate 80% of progress to chapter processing
        job.progress = Math.round(chapterStartProgress);
        this.jobs.set(jobId, job);

        // Split chapter content into paragraphs based on double newline
        const paragraphs = chapter.content.split(/\n\n+/).filter(p => p.trim().length > 0);
        const totalSections = Math.ceil(paragraphs.length / PARAGRAPH_CHUNK_SIZE);

        // --- Section Processing Loop --- 
        for (let j = 0; j < paragraphs.length; j += PARAGRAPH_CHUNK_SIZE) {
          const sectionParagraphs = paragraphs.slice(j, j + PARAGRAPH_CHUNK_SIZE);
          const sectionText = sectionParagraphs.join('\n\n'); // Re-join paragraphs for the API call
          const currentSectionNum = sectionIndex + 1;
          const sectionFilePath = path.join(job.jobDir, `chapter_${chapterIndex}_section_${sectionIndex}.mp3`);

          console.log(`Job ${jobId}: Chapter ${chapterIndex + 1}, Section ${currentSectionNum}/${totalSections}`);
          job.message = `Generating audio: Chapter ${chapterIndex + 1}/${totalChapters}, Section ${currentSectionNum}/${totalSections}`;
          // Update progress within the chapter's allocated 80%
          job.progress = Math.round(chapterStartProgress + ((j / paragraphs.length) * (80 / totalChapters)));
          this.jobs.set(jobId, job);

          // Generate audio for the section
          const audioBuffer = await this._generateSectionAudio(sectionText, settings, jobId, chapterIndex, sectionIndex);
          
          // Save the audio buffer to a temporary file
          await fs.writeFile(sectionFilePath, audioBuffer);
          sectionFilePaths.push(sectionFilePath);
          console.log(`Job ${jobId}: Saved section audio to ${sectionFilePath}`);
          sectionIndex++;
        }
        // --- End Section Loop --- 

        // Concatenate section files into a chapter file
        if (sectionFilePaths.length > 0) {
          console.log(`Job ${jobId}: Concatenating ${sectionFilePaths.length} sections for Chapter ${chapterIndex + 1}`);
          job.message = `Combining audio for Chapter ${chapterIndex + 1}/${totalChapters}`;
          this.jobs.set(jobId, job); 

          await this._concatenateFiles(sectionFilePaths, chapterFilePath, job.jobDir);
          chapterFilePaths.push(chapterFilePath);
          console.log(`Job ${jobId}: Chapter ${chapterIndex + 1} audio saved to ${chapterFilePath}`);
          
          // Clean up temporary section files for this chapter
          console.log(`Job ${jobId}: Cleaning up section files for Chapter ${chapterIndex + 1}`);
          await Promise.all(sectionFilePaths.map(filePath => fs.remove(filePath).catch(err => console.warn(`Could not remove section file ${filePath}:`, err))));
        } else {
            console.warn(`Job ${jobId}: No sections generated for Chapter ${chapterIndex + 1}. Skipping concatenation.`);
        }
      }
      // --- End Chapter Loop --- 

      // Concatenate all chapter files into the final output file
      if (chapterFilePaths.length > 0) {
        console.log(`Job ${jobId}: Concatenating ${chapterFilePaths.length} chapters into final file: ${job.resultPath}`);
        job.message = 'Finalizing audio file...';
        job.progress = 95;
        this.jobs.set(jobId, job);

        await this._concatenateFiles(chapterFilePaths, job.resultPath, job.jobDir);
        console.log(`Job ${jobId}: Final audio file saved to ${job.resultPath}`);

        // Clean up temporary chapter files and the silence file
        console.log(`Job ${jobId}: Cleaning up chapter files and silence file.`);
        const silenceFilePath = path.join(job.jobDir, 'silence.mp3');
        const filesToRemove = [...chapterFilePaths, silenceFilePath];
        await Promise.all(filesToRemove.map(filePath => fs.remove(filePath).catch(err => console.warn(`Could not remove temp file ${filePath}:`, err))));

      } else if (chapters.length > 0) {
        // Handle case where chapters existed but produced no audio
        throw new Error('No audio was generated for any chapter.');
      } else {
        // Handle case where no chapters were provided initially (edge case)
        console.warn(`Job ${jobId}: No chapters provided, creating empty output.`);
        await fs.writeFile(job.resultPath, ''); // Create an empty file
      }

      // --- Final Success --- 
      job.status = 'completed';
      job.progress = 100;
      job.message = 'Audio generation complete.';
      this.jobs.set(jobId, job);
      console.log(`Job ${jobId} completed successfully.`);

    } catch (error) {
      console.error(`Error processing job ${jobId}:`, error);
      const currentJobState = this.jobs.get(jobId) || {}; // Get current state before overwriting
      currentJobState.status = 'failed';
      currentJobState.error = error.message || 'Processing failed due to an unknown error.';
      currentJobState.message = `Job failed: ${error.message}`; // More specific message
      this.jobs.set(jobId, currentJobState);
      
      // Clean up temporary directory on error
      console.error(`Job ${jobId} failed. Cleaning up directory: ${job.jobDir}`);
      await fs.remove(job.jobDir).catch(cleanupErr => console.error(`Error cleaning up directory ${job.jobDir} after failure:`, cleanupErr));
      // Don't re-throw here, error is logged and status is set
    }
  }

  // Generates audio for a single text section using ElevenLabs API
  async _generateSectionAudio(sectionText, settings, jobId, chapterIndex, sectionIndex, maxRetries = 5) {
    const { 
        elevenlabs_key: apiKey,
        elevenlabs_voice_id: voiceId,
        elevenlabs_model: modelId = 'eleven_multilingual_v2', // Default model
        voice_stability: stability,
        voice_similarity_boost: similarityBoost,
        voice_style: style,
        voice_speaker_boost: useSpeakerBoost
    } = settings;

    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const headers = {
      'Accept': 'audio/mpeg', // Request MP3 output
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    };

    // Construct voice_settings object, only including defined values
    const voiceSettings = {};
    if (stability !== undefined && stability !== null) voiceSettings.stability = stability;
    if (similarityBoost !== undefined && similarityBoost !== null) voiceSettings.similarity_boost = similarityBoost;
    if (style !== undefined && style !== null) voiceSettings.style = style;
    if (useSpeakerBoost !== undefined && useSpeakerBoost !== null) voiceSettings.use_speaker_boost = useSpeakerBoost;

    const requestBody = {
      text: sectionText,
      model_id: modelId,
      ...(Object.keys(voiceSettings).length > 0 && { voice_settings: voiceSettings })
    };

    console.log(`Job ${jobId}: Attempting audio generation for Chapter ${chapterIndex + 1}, Section ${sectionIndex + 1}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(apiUrl, requestBody, {
          headers: headers,
          responseType: 'arraybuffer' // Get the response as a raw buffer
        });

        if (response.status === 200 && response.data) {
            console.log(`Job ${jobId}: Successfully generated audio for Chapter ${chapterIndex + 1}, Section ${sectionIndex + 1}`);
            return Buffer.from(response.data); // Return audio data as a Buffer
        } else {
            // This case might not be typical if responseType is arraybuffer, 
            // but included for completeness
            throw new Error(`ElevenLabs API returned status ${response.status}`);
        }
      } catch (error) {
        console.error(`Job ${jobId}: Error generating audio (Attempt ${attempt}/${maxRetries}) for Chapter ${chapterIndex + 1}, Section ${sectionIndex + 1}:`, 
          error.response?.status, error.message);
        
        // Check if the error is retryable (e.g., rate limits, server errors)
        const isRetryable = error.response && (error.response.status === 429 || error.response.status >= 500);

        if (isRetryable && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff (2s, 4s, 8s...)
          console.log(`Job ${jobId}: Retrying in ${delay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Handle non-retryable errors or max retries exceeded
          let errorMessage = `Failed to generate audio for Chapter ${chapterIndex + 1}, Section ${sectionIndex + 1} after ${maxRetries} attempts.`;
          if (error.response?.data) {
            try {
              // Try to parse detailed error from ElevenLabs if available (might be JSON)
              const errorDetails = JSON.parse(Buffer.from(error.response.data).toString());
              errorMessage += ` Error: ${errorDetails.detail?.message || errorDetails.detail || 'Unknown API Error'}`;
            } catch (parseError) {
              // If parsing fails, use the status text or default message
              errorMessage += ` Status: ${error.response?.statusText || 'Unknown API Error'}`;
            }
          } else {
            errorMessage += ` Error: ${error.message}`;
          }
          console.error(errorMessage);
          // Throw a specific error to be caught by _processAudioJob
          throw new Error(errorMessage);
        }
      }
    }
    // Should not be reached if retries fail, as error is thrown
    throw new Error(`Audio generation failed unexpectedly after ${maxRetries} retries.`);
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