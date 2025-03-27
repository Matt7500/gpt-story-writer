import { supabase } from "@/integrations/supabase/client";
import { userSettingsService } from "@/services/UserSettingsService";

interface Chapter {
  title: string;
  content: string;
  completed: boolean;
  sceneBeat: string;
}

interface AudioGenerationDetails {
  currentChapter: number;
  totalChapters: number;
  currentSection: number;
  totalSections: number;
}

interface AudioGenerationProgress {
  progress: number;
  currentChapter: string;
  progressMessage: string | null;
  generationDetails: AudioGenerationDetails | null;
}

interface ElevenLabsVoiceParams {
  key: string;
  voiceId: string;
  model: string;
  stability: number;
  similarityBoost: number;
  voiceStyle?: number;
  speakerBoost?: boolean;
}

interface NoiseGateSettings {
  threshold: number; // in dB
  attack: number;    // in ms
  hold: number;      // in ms
  release: number;   // in ms
}

export class AudioExportService {
  private static instance: AudioExportService;
  private defaultNoiseGateSettings: NoiseGateSettings = {
    threshold: -38, // -38dB
    attack: 2,      // 2ms
    hold: 100,      // 100ms
    release: 1      // 1ms
  };

  private constructor() {}

  public static getInstance(): AudioExportService {
    if (!AudioExportService.instance) {
      AudioExportService.instance = new AudioExportService();
    }
    return AudioExportService.instance;
  }

  // Function to split text into chunks of approximately 5 paragraphs
  private splitTextIntoChunks(text: string): string[] {
    const paragraphs = text.split(/\n+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    
    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') continue;
      
      currentChunk.push(paragraph);
      
      if (currentChunk.length >= 5) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
      }
    }
    
    // Add any remaining paragraphs
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
    }
    
    return chunks;
  }

  // Function to generate audio for a text chunk
  private async generateAudioForChunk(
    text: string, 
    elevenlabsKey: string, 
    voiceId: string, 
    model: string,
    stability: number,
    similarityBoost: number,
    style?: number,
    speakerBoost?: boolean
  ): Promise<ArrayBuffer> {
    const requestBody: any = {
      text,
      model_id: model,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost
      }
    };

    // Add style parameter if provided and using multilingual_v2 model
    if (model === "eleven_multilingual_v2") {
      if (style !== undefined) {
        requestBody.style = style;
      }
      if (speakerBoost !== undefined) {
        requestBody.speaker_boost = speakerBoost;
      }
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenlabsKey
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Provide more specific error messages for common issues
      if (errorData.detail?.status === 'invalid_uid') {
        throw new Error(`Invalid ElevenLabs voice ID: "${voiceId}". Please go to Settings and select a valid voice ID from your ElevenLabs account.`);
      } else if (response.status === 401) {
        throw new Error('ElevenLabs API authentication failed. Please check your API key in Settings.');
      } else {
        throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText} ${JSON.stringify(errorData)}`);
      }
    }

    return await response.arrayBuffer();
  }

  // Function to combine audio buffers with a silence gap
  private async combineAudioBuffers(audioBuffers: ArrayBuffer[]): Promise<Blob> {
    try {
      // Create a silent gap (0.4 seconds)
      const sampleRate = 44100; // Standard sample rate
      const silenceDuration = 0.4; // seconds
      const silenceLength = Math.floor(sampleRate * silenceDuration) * 4; // 4 bytes per sample (16-bit stereo)
      const silenceBuffer = new ArrayBuffer(silenceLength);
      const silenceView = new Uint8Array(silenceBuffer);
      silenceView.fill(0); // Fill with zeros for silence
      
      // Use a more reliable method for combining audio
      // First, create a single large buffer with all content
      const totalLength = audioBuffers.reduce((acc, buffer) => acc + buffer.byteLength, 0) + 
                          (silenceBuffer.byteLength * (audioBuffers.length - 1));
      const combinedBuffer = new Uint8Array(totalLength);
      
      let offset = 0;
      for (let i = 0; i < audioBuffers.length; i++) {
        // Add the audio buffer
        combinedBuffer.set(new Uint8Array(audioBuffers[i]), offset);
        offset += audioBuffers[i].byteLength;
        
        // Add silence between chapters (but not after the last one)
        if (i < audioBuffers.length - 1) {
          combinedBuffer.set(new Uint8Array(silenceBuffer), offset);
          offset += silenceBuffer.byteLength;
        }
      }
      
      // Create a more compatible audio format
      // Use WAV format which is more reliable for editing software
      const wavHeader = this.createWavHeader(totalLength, sampleRate);
      const finalBuffer = new Uint8Array(wavHeader.length + combinedBuffer.length);
      finalBuffer.set(wavHeader, 0);
      finalBuffer.set(combinedBuffer, wavHeader.length);
      
      // Return as a WAV file which is more compatible with editing software
      return new Blob([finalBuffer], { type: 'audio/wav' });
    } catch (error) {
      console.error("Error combining audio buffers:", error);
      // Fallback to the original method if the new method fails
      return this.fallbackCombineAudioBuffers(audioBuffers);
    }
  }
  
  // Fallback method using the original approach
  private fallbackCombineAudioBuffers(audioBuffers: ArrayBuffer[]): Blob {
    // Create a silent gap (0.4 seconds)
    const sampleRate = 44100; // Standard sample rate
    const silenceDuration = 0.4; // seconds
    const silenceLength = Math.floor(sampleRate * silenceDuration) * 4; // 4 bytes per sample (16-bit stereo)
    const silenceBuffer = new ArrayBuffer(silenceLength);
    const silenceView = new Uint8Array(silenceBuffer);
    silenceView.fill(0); // Fill with zeros for silence
    
    // Combine all audio buffers with silence gaps
    const combinedChunks: ArrayBuffer[] = [];
    
    for (let i = 0; i < audioBuffers.length; i++) {
      combinedChunks.push(audioBuffers[i]);
      if (i < audioBuffers.length - 1) {
        combinedChunks.push(silenceBuffer);
      }
    }
    
    // Concatenate all chunks into a single buffer
    const totalLength = combinedChunks.reduce((acc, buffer) => acc + buffer.byteLength, 0);
    const result = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const buffer of combinedChunks) {
      result.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }
    
    return new Blob([result], { type: 'audio/mpeg' });
  }
  
  // Function to create a WAV header
  private createWavHeader(dataLength: number, sampleRate: number): Uint8Array {
    const numChannels = 2; // Stereo
    const bytesPerSample = 2; // 16-bit
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const wavHeader = new Uint8Array(44);
    
    // "RIFF" chunk descriptor
    wavHeader.set([0x52, 0x49, 0x46, 0x46]); // "RIFF" in ASCII
    
    // Chunk size (file size - 8 bytes)
    const chunkSize = dataLength + 36;
    wavHeader[4] = (chunkSize & 0xff);
    wavHeader[5] = ((chunkSize >> 8) & 0xff);
    wavHeader[6] = ((chunkSize >> 16) & 0xff);
    wavHeader[7] = ((chunkSize >> 24) & 0xff);
    
    // Format ("WAVE")
    wavHeader.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE" in ASCII
    
    // "fmt " sub-chunk
    wavHeader.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt " in ASCII
    
    // Sub-chunk size (16 for PCM)
    wavHeader.set([16, 0, 0, 0], 16);
    
    // Audio format (1 for PCM)
    wavHeader.set([1, 0], 20);
    
    // Number of channels
    wavHeader.set([numChannels, 0], 22);
    
    // Sample rate
    wavHeader[24] = (sampleRate & 0xff);
    wavHeader[25] = ((sampleRate >> 8) & 0xff);
    wavHeader[26] = ((sampleRate >> 16) & 0xff);
    wavHeader[27] = ((sampleRate >> 24) & 0xff);
    
    // Byte rate
    wavHeader[28] = (byteRate & 0xff);
    wavHeader[29] = ((byteRate >> 8) & 0xff);
    wavHeader[30] = ((byteRate >> 16) & 0xff);
    wavHeader[31] = ((byteRate >> 24) & 0xff);
    
    // Block align
    wavHeader.set([blockAlign, 0], 32);
    
    // Bits per sample
    wavHeader.set([bytesPerSample * 8, 0], 34);
    
    // "data" sub-chunk
    wavHeader.set([0x64, 0x61, 0x74, 0x61], 36); // "data" in ASCII
    
    // Sub-chunk size (data length)
    wavHeader[40] = (dataLength & 0xff);
    wavHeader[41] = ((dataLength >> 8) & 0xff);
    wavHeader[42] = ((dataLength >> 16) & 0xff);
    wavHeader[43] = ((dataLength >> 24) & 0xff);
    
    return wavHeader;
  }

  // Apply noise gate to the audio buffer
  private applyNoiseGate(audioBlob: Blob, settings: NoiseGateSettings = this.defaultNoiseGateSettings): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      // Create a FileReader to read the Blob
      const reader = new FileReader();
      
      reader.onload = async () => {
        try {
          // Convert FileReader result to ArrayBuffer
          const arrayBuffer = reader.result as ArrayBuffer;
          
          // Extract the header (first 44 bytes) and audio data
          const headerView = new Uint8Array(arrayBuffer, 0, 44);
          const audioDataView = new Uint8Array(arrayBuffer, 44);
          
          // Convert audio data to 16-bit PCM samples
          const dataLength = audioDataView.length;
          const pcmSamples = new Int16Array(dataLength / 2);
          
          // Process samples as 16-bit PCM
          for (let i = 0; i < dataLength; i += 2) {
            // Combine two bytes into one 16-bit sample (little-endian)
            pcmSamples[i / 2] = (audioDataView[i] | (audioDataView[i + 1] << 8));
          }
          
          // Convert threshold from dB to linear amplitude
          // dB = 20 * log10(amplitude)
          // amplitude = 10^(dB/20)
          const thresholdAmplitude = Math.pow(10, settings.threshold / 20) * 32767; // Scale to 16-bit range
          
          // Calculate samples for attack, hold, and release times
          const sampleRate = 44100; // Standard sample rate
          const attackSamples = Math.floor(settings.attack / 1000 * sampleRate);
          const holdSamples = Math.floor(settings.hold / 1000 * sampleRate);
          const releaseSamples = Math.floor(settings.release / 1000 * sampleRate);
          
          // Gate state
          let isGateOpen = false;
          let holdCounter = 0;
          let releaseCounter = 0;
          
          // Process audio samples - apply noise gate
          for (let i = 0; i < pcmSamples.length; i++) {
            const sample = pcmSamples[i];
            const sampleMagnitude = Math.abs(sample);
            
            if (sampleMagnitude >= thresholdAmplitude) {
              // Sample is above threshold
              if (!isGateOpen) {
                // Gate is closed but should open - apply attack
                const attackPhase = Math.min(1, i / attackSamples);
                pcmSamples[i] = Math.round(sample * attackPhase);
              } else {
                // Gate is already open, keep sample as is
              }
              isGateOpen = true;
              holdCounter = holdSamples; // Reset hold counter
              releaseCounter = 0; // Reset release counter
            } else {
              // Sample is below threshold
              if (isGateOpen) {
                if (holdCounter > 0) {
                  // Still in hold phase, keep gate open
                  holdCounter--;
                } else {
                  // Hold completed, start release phase
                  releaseCounter++;
                  
                  if (releaseCounter >= releaseSamples) {
                    // Release completed, close gate
                    isGateOpen = false;
                    pcmSamples[i] = 0; // Silence the sample
                  } else {
                    // Still in release phase
                    const releasePhase = 1 - (releaseCounter / releaseSamples);
                    pcmSamples[i] = Math.round(sample * releasePhase);
                  }
                }
              } else {
                // Gate is closed, silence the sample
                pcmSamples[i] = 0;
              }
            }
          }
          
          // Convert processed samples back to byte array
          const processedData = new Uint8Array(pcmSamples.length * 2);
          for (let i = 0; i < pcmSamples.length; i++) {
            const sample = pcmSamples[i];
            processedData[i * 2] = sample & 0xFF; // Low byte
            processedData[i * 2 + 1] = (sample >> 8) & 0xFF; // High byte
          }
          
          // Combine header and processed audio data
          const processedBuffer = new Uint8Array(headerView.length + processedData.length);
          processedBuffer.set(headerView, 0); // Copy header
          processedBuffer.set(processedData, headerView.length); // Copy processed audio data
          
          // Create new blob with processed audio
          resolve(new Blob([processedBuffer], { type: 'audio/wav' }));
        } catch (error) {
          console.error('Error applying noise gate:', error);
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read audio file'));
      };
      
      // Start reading the blob as ArrayBuffer
      reader.readAsArrayBuffer(audioBlob);
    });
  }

  // Convert WAV to MP3 using Web Audio API
  private convertWavToMp3(wavBlob: Blob): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      try {
        // First, we need to convert our WAV blob to an audio buffer
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const reader = new FileReader();
        
        reader.onload = async () => {
          try {
            // Decode the WAV data into an AudioBuffer
            const audioData = reader.result as ArrayBuffer;
            const audioBuffer = await audioContext.decodeAudioData(audioData);
            
            // Create a MediaStreamDestination to receive the audio data
            const destination = audioContext.createMediaStreamDestination();
            
            // Create a source from the AudioBuffer
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(destination);
            
            // Create MediaRecorder to record as MP3
            const mediaRecorder = new MediaRecorder(destination.stream, {
              mimeType: 'audio/webm; codecs=opus', // Most compatible format
              audioBitsPerSecond: 128000 // 128kbps
            });
            
            const chunks: Blob[] = [];
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data);
              }
            };
            
            mediaRecorder.onstop = () => {
              // Convert webm audio to mp3-like blob
              const audioBlob = new Blob(chunks, { type: 'audio/mpeg' });
              resolve(audioBlob);
            };
            
            // Start recording and playing the audio
            mediaRecorder.start();
            source.start(0);
            
            // Stop the recorder after the audio duration
            setTimeout(() => {
              mediaRecorder.stop();
              source.stop();
            }, audioBuffer.duration * 1000 + 100); // Add a small buffer
          } catch (error) {
            console.error('Error converting WAV to MP3:', error);
            // If conversion fails, fall back to the original WAV
            resolve(wavBlob);
          }
        };
        
        reader.onerror = () => {
          console.error('Error reading WAV file');
          // If reading fails, fall back to the original WAV
          resolve(wavBlob);
        };
        
        reader.readAsArrayBuffer(wavBlob);
      } catch (error) {
        console.error('Error setting up WAV to MP3 conversion:', error);
        // If setup fails, fall back to the original WAV
        resolve(wavBlob);
      }
    });
  }

  // Helper function to validate ElevenLabs settings
  private validateElevenLabsSettings(settings: any): ElevenLabsVoiceParams {
    if (!settings.elevenlabs_key) {
      throw new Error('ElevenLabs API key not configured. Please add it in settings.');
    }
    
    if (!settings.elevenlabs_voice_id) {
      throw new Error('ElevenLabs voice not selected. Please select a voice in settings.');
    }
    
    // ElevenLabs voice IDs are typically 24-character alphanumeric strings
    if (settings.elevenlabs_voice_id.includes('@') || 
        settings.elevenlabs_voice_id.length < 20 || 
        !/^[a-zA-Z0-9]+$/.test(settings.elevenlabs_voice_id)) {
      throw new Error(
        'Invalid ElevenLabs voice ID format. Please go to Settings and select a valid voice ID. ' +
        'Voice IDs can be found in your ElevenLabs account under "Profile" > "API Key".'
      );
    }
    
    if (!settings.elevenlabs_model) {
      throw new Error('ElevenLabs model not selected. Please select a model in settings.');
    }
    
    return {
      key: settings.elevenlabs_key,
      voiceId: settings.elevenlabs_voice_id,
      model: settings.elevenlabs_model,
      stability: settings.voice_stability ?? 0.75,
      similarityBoost: settings.voice_similarity_boost ?? 0.75,
      voiceStyle: settings.voice_style,
      speakerBoost: settings.voice_speaker_boost
    };
  }

  public async generateAudio(
    chapters: Chapter[], 
    title: string, 
    onProgress?: (progress: AudioGenerationProgress) => void,
    signal?: AbortSignal
  ): Promise<Blob> {
    try {
      // Set initial progress
      if (onProgress) {
        onProgress({
          progress: 0,
          currentChapter: "",
          progressMessage: 'Preparing chapters for audio generation...',
          generationDetails: null
        });
      }
      
      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      // Get user settings
      userSettingsService.clearCache(session.user.id);
      const settings = await userSettingsService.getSettings(session.user.id);
      
      // Validate ElevenLabs settings and get voice parameters
      const voiceParams = this.validateElevenLabsSettings(settings);
      
      // Prepare all chapters and their chunks
      const chapterProcessingData = chapters.map((chapter, index) => ({
        index,
        title: chapter.title,
        chunks: this.splitTextIntoChunks(chapter.content)
      }));
      
      // Total number of chunks across all chapters for progress calculation
      const totalChunks = chapterProcessingData.reduce((sum, chapter) => sum + chapter.chunks.length, 0);
      let processedChunks = 0;
      
      // Process all chapters in parallel
      const chapterAudioPromises = chapterProcessingData.map(async (chapterData) => {
        // Check if generation was cancelled
        if (signal?.aborted) {
          throw new Error('Audio generation cancelled');
        }
        
        const { index, title, chunks } = chapterData;
        
        // Process each chunk in sequence for this chapter
        const chunkAudioBuffers: ArrayBuffer[] = [];
        
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          // Check if generation was cancelled
          if (signal?.aborted) {
            throw new Error('Audio generation cancelled');
          }
          
          // Update progress for this specific chunk
          if (onProgress) {
            onProgress({
              progress: (processedChunks / totalChunks) * 100,
              currentChapter: title,
              progressMessage: `Generating audio for Chapter ${index + 1}/${chapters.length}, Section ${chunkIndex + 1}/${chunks.length}`,
              generationDetails: {
                currentChapter: index + 1,
                totalChapters: chapters.length,
                currentSection: chunkIndex + 1,
                totalSections: chunks.length
              }
            });
          }
          
          // Generate audio for this chunk
          try {
            const audioBuffer = await this.generateAudioForChunk(
              chunks[chunkIndex],
              voiceParams.key,
              voiceParams.voiceId,
              voiceParams.model,
              voiceParams.stability,
              voiceParams.similarityBoost,
              voiceParams.voiceStyle,
              voiceParams.speakerBoost
            );
            
            chunkAudioBuffers.push(audioBuffer);
            
            // Update overall progress
            processedChunks++;
            if (onProgress) {
              onProgress({
                progress: (processedChunks / totalChunks) * 100,
                currentChapter: title,
                progressMessage: `Generating audio for Chapter ${index + 1}/${chapters.length}, Section ${chunkIndex + 1}/${chunks.length}`,
                generationDetails: {
                  currentChapter: index + 1,
                  totalChapters: chapters.length,
                  currentSection: chunkIndex + 1,
                  totalSections: chunks.length
                }
              });
            }
            
          } catch (error) {
            console.error(`Error generating audio for chunk ${chunkIndex + 1} of chapter ${index + 1}:`, error);
            throw error;
          }
        }
        
        // Combine all chunks for this chapter
        const chapterAudioBuffer = await this.combineAudioBuffers(chunkAudioBuffers);
        return chapterAudioBuffer.arrayBuffer();
      });
      
      // Wait for all chapter audio generation to complete
      if (onProgress) {
        onProgress({
          progress: 95,
          currentChapter: "",
          progressMessage: 'Finalizing all chapters...',
          generationDetails: null
        });
      }
      
      const chapterAudioBuffers = await Promise.all(chapterAudioPromises);
      
      // Combine all chapter audio files
      if (onProgress) {
        onProgress({
          progress: 97,
          currentChapter: "",
          progressMessage: 'Combining all chapters into final audio file...',
          generationDetails: null
        });
      }
      
      const combinedAudioBlob = await this.combineAudioBuffers(chapterAudioBuffers);
      
      // Apply noise gate to the audio
      if (onProgress) {
        onProgress({
          progress: 98,
          currentChapter: "",
          progressMessage: 'Applying noise gate to reduce background noise...',
          generationDetails: null
        });
      }
      
      const processedAudioBlob = await this.applyNoiseGate(combinedAudioBlob);
      
      // Convert WAV to MP3
      if (onProgress) {
        onProgress({
          progress: 99,
          currentChapter: "",
          progressMessage: 'Converting to MP3 format...',
          generationDetails: null
        });
      }
      
      const mp3AudioBlob = await this.convertWavToMp3(processedAudioBlob);
      
      // Complete the progress
      if (onProgress) {
        onProgress({
          progress: 100,
          currentChapter: "",
          progressMessage: 'Audio generation complete!',
          generationDetails: null
        });
      }
      
      return mp3AudioBlob;
      
    } catch (error: any) {
      console.error("Audio generation process ended:", {
        type: error.message === 'Audio generation cancelled' ? 'Cancellation' : 'Error',
        message: error.message,
        details: error.stack
      });
      
      throw error;
    }
  }

  public downloadAudioFile(audioBlob: Blob, title: string): void {
    // Create download link
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `${sanitizedTitle}_audio.mp3`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

// Export a singleton instance
export const audioExportService = AudioExportService.getInstance(); 