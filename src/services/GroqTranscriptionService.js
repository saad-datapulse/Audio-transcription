/**
 * Groq Transcription Service
 * Handles audio transcription using the Groq Whisper API
 */

import { splitAudioIntoChunks, checkIfNeedsChunking } from './AudioChunkingService';

/**
 * Transcribes a single audio file/blob using Groq API
 * @param {File|Blob} file - The audio file to transcribe
 * @param {Object} options - Transcription options
 * @param {string} options.language - Language code (default: "en")
 * @param {Function} options.onProgress - Progress callback
 * @param {string} options.filename - Optional filename for blobs
 * @param {boolean} options.includeTimestamps - Whether to include timestamps
 * @param {number} options.timeOffset - Time offset for chunked audio segments
 * @returns {Promise<Object>} - Transcription result
 */
export async function transcribeSingleAudio(file, options = {}) {
  const { language = "en", onProgress, filename, includeTimestamps = true, timeOffset = 0 } = options;

  try {
    onProgress?.({ status: "uploading", message: "Uploading audio file..." });

    const formData = new FormData();
    
    // If it's a Blob (from chunking), we need to give it a filename
    if (file instanceof Blob && !(file instanceof File)) {
      formData.append("file", file, filename || "audio-chunk.wav");
    } else {
      formData.append("file", file);
    }
    
    formData.append("language", language);
    formData.append("include_timestamps", includeTimestamps ? "true" : "false");

    onProgress?.({ status: "transcribing", message: "Transcribing audio..." });

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to transcribe audio");
    }

    onProgress?.({ status: "completed", message: "Transcription complete!" });

    // Adjust segment timestamps if there's an offset (for chunked audio)
    let segments = result.segments || [];
    if (timeOffset > 0 && segments.length > 0) {
      segments = segments.map(seg => ({
        ...seg,
        start: seg.start + timeOffset,
        end: seg.end + timeOffset,
      }));
    }

    return {
      success: true,
      text: result.text,
      language: result.language,
      duration: result.duration,
      segments,
    };

  } catch (error) {
    onProgress?.({ status: "error", message: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Transcribes an audio file, automatically chunking if needed
 * @param {File} file - The audio file to transcribe
 * @param {Object} options - Transcription options
 * @param {string} options.language - Language code (default: "en")
 * @param {Function} options.onProgress - Progress callback
 * @param {boolean} options.includeTimestamps - Whether to include timestamps
 * @returns {Promise<Object>} - Transcription result
 */
export async function transcribeAudio(file, options = {}) {
  const { language = "en", onProgress, includeTimestamps = true } = options;

  try {
    // Check if file needs chunking
    onProgress?.({ status: "analyzing", message: "Analyzing audio file..." });
    
    const chunkCheck = await checkIfNeedsChunking(file);
    
    if (!chunkCheck.needsChunking) {
      // File is small enough, transcribe directly
      return await transcribeSingleAudio(file, { language, onProgress, includeTimestamps });
    }

    // File needs chunking
    onProgress?.({ 
      status: "chunking", 
      message: `Splitting audio into ~${chunkCheck.estimatedChunks} chunks...` 
    });

    const chunks = await splitAudioIntoChunks(file);
    
    onProgress?.({ 
      status: "transcribing", 
      message: `Transcribing ${chunks.length} chunks...`,
      totalChunks: chunks.length
    });

    // Transcribe each chunk
    const transcriptions = [];
    let totalText = "";
    let allSegments = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      onProgress?.({
        status: "transcribing",
        message: `Transcribing chunk ${i + 1} of ${chunks.length}...`,
        progress: ((i) / chunks.length) * 100,
        currentChunk: i + 1,
        totalChunks: chunks.length,
      });

      const result = await transcribeSingleAudio(chunk.blob, { 
        language,
        filename: `chunk-${i + 1}.wav`,
        includeTimestamps,
        timeOffset: chunk.startTime, // Offset timestamps by chunk start time
      });

      if (!result.success) {
        // Return partial results on error
        return {
          success: false,
          error: `Failed to transcribe chunk ${i + 1}: ${result.error}`,
          partialText: totalText,
          segments: allSegments,
          completedChunks: i,
          totalChunks: chunks.length,
        };
      }

      transcriptions.push({
        chunkIndex: i,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        duration: chunk.duration,
        text: result.text,
      });

      // Collect segments from this chunk
      if (result.segments) {
        allSegments = [...allSegments, ...result.segments];
      }

      totalText += (totalText ? " " : "") + result.text;
    }

    onProgress?.({ 
      status: "completed", 
      message: "All chunks transcribed!",
      progress: 100 
    });

    return {
      success: true,
      text: totalText,
      segments: allSegments,
      chunks: transcriptions,
      language,
      totalDuration: chunkCheck.duration,
      wasChunked: true,
    };

  } catch (error) {
    onProgress?.({ status: "error", message: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Formats timestamp in seconds to HH:MM:SS or MM:SS format
 * @param {number} seconds - Time in seconds
 * @returns {string} - Formatted timestamp
 */
export function formatTimestamp(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Generates a text file content with timestamps from segments
 * @param {Array} segments - Array of segments with start, end, and text
 * @param {Object} options - Options for formatting
 * @returns {string} - Formatted text content
 */
export function generateTimestampedText(segments, options = {}) {
  const { includeEndTime = false, filename = '' } = options;
  
  let content = '';
  
  if (filename) {
    content += `Transcription: ${filename}\n`;
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += '─'.repeat(50) + '\n\n';
  }
  
  for (const segment of segments) {
    const startTime = formatTimestamp(segment.start);
    const endTime = formatTimestamp(segment.end);
    
    if (includeEndTime) {
      content += `[${startTime} - ${endTime}]\n`;
    } else {
      content += `[${startTime}]\n`;
    }
    content += `${segment.text}\n\n`;
  }
  
  return content;
}

/**
 * Downloads transcription as a text file
 * @param {Object} transcription - Transcription result with text and segments
 * @param {string} filename - Original audio filename
 */
export function downloadTranscription(transcription, filename = 'transcription') {
  const baseFilename = filename.replace(/\.[^/.]+$/, ''); // Remove extension
  
  let content;
  
  if (transcription.segments && transcription.segments.length > 0) {
    // Generate timestamped version
    content = generateTimestampedText(transcription.segments, { 
      includeEndTime: true,
      filename: baseFilename 
    });
  } else {
    // Plain text without timestamps
    content = `Transcription: ${baseFilename}\n`;
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += '─'.repeat(50) + '\n\n';
    content += transcription.text;
  }
  
  // Create blob and download
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseFilename}_transcription.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

// Supported languages for Whisper
export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "uk", name: "Ukrainian" },
  { code: "vi", name: "Vietnamese" },
  { code: "th", name: "Thai" },
  { code: "id", name: "Indonesian" },
  { code: "auto", name: "Auto-detect" },
];

export default {
  transcribeAudio,
  transcribeSingleAudio,
  formatTimestamp,
  generateTimestampedText,
  downloadTranscription,
  SUPPORTED_LANGUAGES,
};
