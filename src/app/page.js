"use client";

import { useState, useRef } from "react";
import { prepareForTranscription, CONFIG } from "@/services/AudioTranscriptionService";
import { transcribeAudio, downloadTranscription, formatTimestamp, SUPPORTED_LANGUAGES } from "@/services/GroqTranscriptionService";

export default function Home() {
  const [file, setFile] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState("");
  const [transcriptionProgress, setTranscriptionProgress] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const fileInputRef = useRef(null);

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;

    setError(null);
    setIsProcessing(true);

    try {
      const result = await prepareForTranscription(selectedFile);

      if (!result.ready) {
        setError(result.error);
        setFile(null);
        setFileInfo(null);
      } else {
        setFile(selectedFile);
        setFileInfo(result);
      }
    } catch (err) {
      setError("Failed to process audio file");
      setFile(null);
      setFileInfo(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInputChange = (e) => {
    const selectedFile = e.target.files?.[0];
    handleFileSelect(selectedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    handleFileSelect(droppedFile);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    setFile(null);
    setFileInfo(null);
    setError(null);
    setTranscription(null);
    setTranscriptionStatus("");
    setTranscriptionProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleTranscribe = async () => {
    if (!file) return;

    setIsTranscribing(true);
    setError(null);
    setTranscription(null);
    setTranscriptionProgress(null);

    const result = await transcribeAudio(file, {
      language: selectedLanguage === "auto" ? undefined : selectedLanguage,
      onProgress: (progress) => {
        setTranscriptionStatus(progress.message);
        if (progress.progress !== undefined) {
          setTranscriptionProgress(progress.progress);
        }
        if (progress.currentChunk) {
          setTranscriptionProgress({
            current: progress.currentChunk,
            total: progress.totalChunks
          });
        }
      },
    });

    setIsTranscribing(false);

    if (result.success) {
      setTranscription(result);
    } else {
      setError(result.error);
      // Show partial transcription if available
      if (result.partialText) {
        setTranscription({
          text: result.partialText,
          partial: true,
          completedChunks: result.completedChunks,
          totalChunks: result.totalChunks
        });
      }
    }
  };

  const handleCopyText = () => {
    if (transcription?.text) {
      navigator.clipboard.writeText(transcription.text);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-white mb-3">
            Audio Transcription
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Upload an audio file to transcribe it using Groq Whisper API
          </p>
        </div>

        {/* Upload Area */}
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
            transition-all duration-200 ease-in-out
            ${isDragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
              : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 bg-white dark:bg-zinc-900"
            }
            ${error ? "border-red-400 dark:border-red-600" : ""}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={CONFIG.ALL_FORMATS.map((f) => `.${f}`).join(",")}
            onChange={handleInputChange}
            className="hidden"
          />

          {isProcessing ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-600 dark:text-zinc-400">Processing file...</p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-zinc-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Drop your audio file here
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                or click to browse
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-4">
                Supported: {CONFIG.SUPPORTED_FORMATS.join(", ")} (max {CONFIG.MAX_FILE_SIZE_MB}MB)
              </p>
            </>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* File Info Card */}
        {fileInfo && (
          <div className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-blue-600 dark:text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-zinc-900 dark:text-white truncate max-w-xs">
                    {fileInfo.file.name}
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {fileInfo.file.sizeInMB} MB • {fileInfo.file.format.toUpperCase()}
                    {fileInfo.file.durationFormatted && ` • ${fileInfo.file.durationFormatted}`}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile();
                }}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <svg
                  className="w-5 h-5 text-zinc-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Processing Notes */}
            {(fileInfo.processing.needsConversion || fileInfo.processing.needsChunking) && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                <p className="text-amber-700 dark:text-amber-400 text-sm">
                  {fileInfo.processing.needsConversion && (
                    <span>⚡ File will be converted to {fileInfo.processing.targetFormat}. </span>
                  )}
                  {fileInfo.processing.needsChunking && (
                    <span>
                      📦 File will be split into {fileInfo.processing.chunkInfo?.numberOfChunks} chunks for processing.
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Language Selector */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Audio Language
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Transcribe Button */}
            <button
              onClick={handleTranscribe}
              disabled={isTranscribing}
              className="mt-6 w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex flex-col items-center justify-center gap-2"
            >
              {isTranscribing ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {transcriptionStatus || "Transcribing..."}
                  </div>
                  {transcriptionProgress?.current && (
                    <div className="w-full bg-blue-500 rounded-full h-1.5 mt-2">
                      <div 
                        className="bg-white h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${(transcriptionProgress.current / transcriptionProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                  Start Transcription
                </div>
              )}
            </button>
          </div>
        )}

        {/* Transcription Result */}
        {transcription && (
          <div className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-zinc-900 dark:text-white">
                  Transcription Result
                </h3>
                {transcription.partial && (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    ⚠️ Partial result ({transcription.completedChunks}/{transcription.totalChunks} chunks)
                  </p>
                )}
                {transcription.wasChunked && !transcription.partial && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Processed in {transcription.chunks?.length} chunks
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyText}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors text-zinc-700 dark:text-zinc-300"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy
                </button>
                <button
                  onClick={() => downloadTranscription(transcription, file?.name)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded-lg transition-colors text-blue-700 dark:text-blue-300"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download .txt
                </button>
              </div>
            </div>

            {/* Timestamped Segments */}
            {transcription.segments && transcription.segments.length > 0 && (
              <div className="mt-4">
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-2">
                    <svg
                      className="w-4 h-4 transition-transform group-open:rotate-90"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    View timestamped segments ({transcription.segments.length})
                  </summary>
                  <div className="mt-3 max-h-96 overflow-y-auto space-y-2">
                    {transcription.segments.map((segment, index) => (
                      <div
                        key={index}
                        className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg"
                      >
                        <span className="inline-block px-2 py-0.5 text-xs font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded mb-1">
                          {formatTimestamp(segment.start)} → {formatTimestamp(segment.end)}
                        </span>
                        <p className="text-zinc-800 dark:text-zinc-200 text-sm">
                          {segment.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {/* Plain text display */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl mt-4">
              <p className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                {transcription.text}
              </p>
            </div>
            {transcription.duration && (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                Duration: {Math.round(transcription.duration)}s
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
