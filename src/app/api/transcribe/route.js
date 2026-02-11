import { NextResponse } from "next/server";

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Fetch with retry logic for transient network errors
 */
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const isRetryable = error.cause?.code === 'ETIMEDOUT' || 
                          error.cause?.code === 'ECONNRESET' ||
                          error.message?.includes('fetch failed');
      
      if (isLastAttempt || !isRetryable) {
        throw error;
      }
      
      console.log(`Attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }
}

export async function POST(request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const language = formData.get("language") || "en";
    const includeTimestamps = formData.get("include_timestamps") === "true";

    if (!file) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Create FormData for Groq API
    const groqFormData = new FormData();
    groqFormData.append("file", file);
    groqFormData.append("model", "whisper-large-v3");
    groqFormData.append("language", language);
    // Use verbose_json to get timestamps with segments
    groqFormData.append("response_format", includeTimestamps ? "verbose_json" : "json");

    // Call Groq API with retry logic
    const response = await fetchWithRetry(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: groqFormData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Groq API Error:", errorData);
      return NextResponse.json(
        { 
          error: errorData.error?.message || "Failed to transcribe audio",
          details: errorData 
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    // Build response based on format
    const responseData = {
      success: true,
      text: result.text,
      language: result.language || language,
      duration: result.duration,
    };

    // Include segments with timestamps if verbose_json was used
    if (includeTimestamps && result.segments) {
      responseData.segments = result.segments.map(segment => ({
        id: segment.id,
        start: segment.start,
        end: segment.end,
        text: segment.text.trim(),
      }));
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error("Transcription error:", error);
    
    // Provide more helpful error messages for common issues
    let errorMessage = "Internal server error";
    if (error.cause?.code === 'ETIMEDOUT') {
      errorMessage = "Request timed out. Please try again.";
    } else if (error.cause?.code === 'ECONNRESET') {
      errorMessage = "Connection was reset. Please try again.";
    } else if (error.message?.includes('fetch failed')) {
      errorMessage = "Network error. Please check your connection and try again.";
    }
    
    return NextResponse.json(
      { error: errorMessage, message: error.message },
      { status: 500 }
    );
  }
}

// Next.js App Router config for large file uploads
export const maxDuration = 60; // Max execution time in seconds
export const dynamic = 'force-dynamic';
