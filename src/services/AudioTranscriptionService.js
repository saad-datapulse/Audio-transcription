/**
 * Audio Transcription Service using Groq Whisper API
 * 
 * Handles:
 * - Multiple audio formats (mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac)
 * - Long audio files via chunking
 * - File size validation
 */

// Supported audio formats by Groq Whisper API
const SUPPORTED_FORMATS = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'];

// Additional formats that need conversion
const CONVERTIBLE_FORMATS = ['ogg', 'flac', 'aac', 'wma', 'aiff'];

// Groq API limits
const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Chunk settings for long audio files
const CHUNK_DURATION_SECONDS = 600; // 10 minutes per chunk

/**
 * Validates if the audio format is supported
 * @param {string} filename - The name of the audio file
 * @returns {Object} - Validation result with format info
 */
export function validateAudioFormat(filename) {
  const extension = filename.split('.').pop()?.toLowerCase();
  
  if (!extension) {
    return {
      valid: false,
      error: 'Unable to determine file format',
      format: null,
      needsConversion: false
    };
  }

  if (SUPPORTED_FORMATS.includes(extension)) {
    return {
      valid: true,
      format: extension,
      needsConversion: false,
      error: null
    };
  }

  if (CONVERTIBLE_FORMATS.includes(extension)) {
    return {
      valid: true,
      format: extension,
      needsConversion: true,
      targetFormat: 'mp3',
      error: null
    };
  }

  return {
    valid: false,
    error: `Unsupported audio format: ${extension}. Supported formats: ${[...SUPPORTED_FORMATS, ...CONVERTIBLE_FORMATS].join(', ')}`,
    format: extension,
    needsConversion: false
  };
}

/**
 * Validates file size
 * @param {number} fileSize - File size in bytes
 * @returns {Object} - Validation result
 */
export function validateFileSize(fileSize) {
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      needsChunking: true,
      error: `File size (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum limit of ${MAX_FILE_SIZE_MB}MB. File will be chunked for processing.`
    };
  }

  return {
    valid: true,
    needsChunking: false,
    error: null
  };
}

/**
 * Processes an audio file for transcription
 * @param {File} file - The audio file to process
 * @returns {Object} - Processing result with file info and requirements
 */
export async function processAudioFile(file) {
  const formatValidation = validateAudioFormat(file.name);
  
  if (!formatValidation.valid) {
    return {
      success: false,
      error: formatValidation.error,
      file: null
    };
  }

  const sizeValidation = validateFileSize(file.size);

  return {
    success: true,
    file: {
      name: file.name,
      size: file.size,
      sizeInMB: (file.size / 1024 / 1024).toFixed(2),
      format: formatValidation.format,
      mimeType: file.type
    },
    requirements: {
      needsConversion: formatValidation.needsConversion,
      targetFormat: formatValidation.targetFormat || null,
      needsChunking: sizeValidation.needsChunking
    },
    error: null
  };
}

/**
 * Calculates chunk information for long audio files
 * @param {number} durationSeconds - Total duration in seconds
 * @returns {Object} - Chunk information
 */
export function calculateChunks(durationSeconds) {
  const numberOfChunks = Math.ceil(durationSeconds / CHUNK_DURATION_SECONDS);
  
  const chunks = [];
  for (let i = 0; i < numberOfChunks; i++) {
    const startTime = i * CHUNK_DURATION_SECONDS;
    const endTime = Math.min((i + 1) * CHUNK_DURATION_SECONDS, durationSeconds);
    
    chunks.push({
      index: i,
      startTime,
      endTime,
      duration: endTime - startTime
    });
  }

  return {
    totalDuration: durationSeconds,
    chunkDuration: CHUNK_DURATION_SECONDS,
    numberOfChunks,
    chunks
  };
}

/**
 * Gets audio duration from a File object
 * @param {File} file - The audio file
 * @returns {Promise<number>} - Duration in seconds
 */
export function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);
    
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(objectUrl);
      resolve(audio.duration);
    });
    
    audio.addEventListener('error', (e) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load audio file metadata'));
    });
    
    audio.src = objectUrl;
  });
}

/**
 * Prepares audio file for Groq API transcription
 * @param {File} file - The audio file
 * @returns {Promise<Object>} - Prepared file data with all necessary info
 */
export async function prepareForTranscription(file) {
  // Validate format
  const formatValidation = validateAudioFormat(file.name);
  if (!formatValidation.valid) {
    return {
      ready: false,
      error: formatValidation.error
    };
  }

  // Validate size
  const sizeValidation = validateFileSize(file.size);

  // Get audio duration
  let duration = null;
  let chunkInfo = null;
  
  try {
    duration = await getAudioDuration(file);
    
    // If file needs chunking based on size or duration
    if (sizeValidation.needsChunking || duration > CHUNK_DURATION_SECONDS) {
      chunkInfo = calculateChunks(duration);
    }
  } catch (error) {
    console.warn('Could not determine audio duration:', error.message);
  }

  return {
    ready: true,
    file: {
      name: file.name,
      size: file.size,
      sizeInMB: (file.size / 1024 / 1024).toFixed(2),
      format: formatValidation.format,
      mimeType: file.type,
      duration: duration ? Math.round(duration) : null,
      durationFormatted: duration ? formatDuration(duration) : null
    },
    processing: {
      needsConversion: formatValidation.needsConversion,
      targetFormat: formatValidation.targetFormat || null,
      needsChunking: sizeValidation.needsChunking || (duration && duration > CHUNK_DURATION_SECONDS),
      chunkInfo
    },
    error: null
  };
}

/**
 * Formats duration in seconds to human readable format
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration (HH:MM:SS)
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Export constants for external use
export const CONFIG = {
  SUPPORTED_FORMATS,
  CONVERTIBLE_FORMATS,
  ALL_FORMATS: [...SUPPORTED_FORMATS, ...CONVERTIBLE_FORMATS],
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
  CHUNK_DURATION_SECONDS
};

export default {
  validateAudioFormat,
  validateFileSize,
  processAudioFile,
  calculateChunks,
  getAudioDuration,
  prepareForTranscription,
  CONFIG
};
