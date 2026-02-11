/**
 * Audio Chunking Service
 * Splits large audio files into smaller chunks for processing
 */

// Chunk duration in seconds (Groq recommends under 25MB which is roughly 10 min of audio)
const CHUNK_DURATION_SECONDS = 300; // 5 minutes per chunk for safety

/**
 * Splits an audio file into chunks using Web Audio API
 * @param {File} file - The audio file to split
 * @param {number} chunkDurationSeconds - Duration of each chunk in seconds
 * @returns {Promise<Blob[]>} - Array of audio blobs
 */
export async function splitAudioIntoChunks(file, chunkDurationSeconds = CHUNK_DURATION_SECONDS) {
  // Create audio context
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  
  // Decode audio data
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;
  
  // If audio is short enough, return as single chunk
  if (duration <= chunkDurationSeconds) {
    return [{
      blob: file,
      startTime: 0,
      endTime: duration,
      index: 0
    }];
  }
  
  const chunks = [];
  const samplesPerChunk = chunkDurationSeconds * sampleRate;
  const totalSamples = audioBuffer.length;
  
  let chunkIndex = 0;
  let currentSample = 0;
  
  while (currentSample < totalSamples) {
    const chunkSamples = Math.min(samplesPerChunk, totalSamples - currentSample);
    const startTime = currentSample / sampleRate;
    const endTime = (currentSample + chunkSamples) / sampleRate;
    
    // Create new audio buffer for this chunk
    const chunkBuffer = audioContext.createBuffer(
      numberOfChannels,
      chunkSamples,
      sampleRate
    );
    
    // Copy audio data to chunk buffer
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const chunkData = chunkBuffer.getChannelData(channel);
      
      for (let i = 0; i < chunkSamples; i++) {
        chunkData[i] = sourceData[currentSample + i];
      }
    }
    
    // Convert audio buffer to WAV blob
    const wavBlob = audioBufferToWav(chunkBuffer);
    
    chunks.push({
      blob: wavBlob,
      startTime,
      endTime,
      index: chunkIndex,
      duration: endTime - startTime
    });
    
    currentSample += chunkSamples;
    chunkIndex++;
  }
  
  await audioContext.close();
  
  return chunks;
}

/**
 * Converts an AudioBuffer to a WAV Blob
 * @param {AudioBuffer} buffer - The audio buffer to convert
 * @returns {Blob} - WAV audio blob
 */
function audioBufferToWav(buffer) {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;
  
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;
  
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Write interleaved audio data
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      // Clamp sample to [-1, 1] and convert to 16-bit integer
      const intSample = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Writes a string to a DataView
 */
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Gets the duration of an audio file
 * @param {File} file - The audio file
 * @returns {Promise<number>} - Duration in seconds
 */
export async function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    });
    
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load audio metadata'));
    });
    
    audio.src = url;
  });
}

/**
 * Check if file needs chunking based on size or duration
 * @param {File} file - The audio file
 * @param {number} maxSizeMB - Max size in MB before chunking
 * @param {number} maxDurationSeconds - Max duration in seconds before chunking
 * @returns {Promise<{needsChunking: boolean, reason: string|null, duration: number}>}
 */
export async function checkIfNeedsChunking(file, maxSizeMB = 25, maxDurationSeconds = 300) {
  const fileSizeMB = file.size / (1024 * 1024);
  
  try {
    const duration = await getAudioDuration(file);
    
    if (fileSizeMB > maxSizeMB) {
      return {
        needsChunking: true,
        reason: `File size (${fileSizeMB.toFixed(1)}MB) exceeds ${maxSizeMB}MB limit`,
        duration,
        estimatedChunks: Math.ceil(duration / CHUNK_DURATION_SECONDS)
      };
    }
    
    if (duration > maxDurationSeconds) {
      return {
        needsChunking: true,
        reason: `Duration (${Math.round(duration)}s) exceeds ${maxDurationSeconds}s limit`,
        duration,
        estimatedChunks: Math.ceil(duration / CHUNK_DURATION_SECONDS)
      };
    }
    
    return {
      needsChunking: false,
      reason: null,
      duration,
      estimatedChunks: 1
    };
  } catch (error) {
    // If we can't determine duration, base decision on file size
    return {
      needsChunking: fileSizeMB > maxSizeMB,
      reason: fileSizeMB > maxSizeMB ? `File size exceeds ${maxSizeMB}MB limit` : null,
      duration: null,
      estimatedChunks: fileSizeMB > maxSizeMB ? Math.ceil(fileSizeMB / 10) : 1
    };
  }
}

export default {
  splitAudioIntoChunks,
  getAudioDuration,
  checkIfNeedsChunking,
  CHUNK_DURATION_SECONDS
};
