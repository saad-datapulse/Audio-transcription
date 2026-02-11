# Audio Transcription App

A web application that transcribes audio files to text using the Groq Whisper API. Built with Next.js 16 and React 19.

## Features

- 🎵 **Multi-format support** – MP3, MP4, WAV, WebM, M4A, OGG, FLAC, and more
- ⏱️ **Timestamped transcriptions** – Per-segment timestamps for navigation
- 📦 **Automatic chunking** – Handles long audio files (>5 min or >25MB)
- 🌍 **20+ languages** – Including auto-detection
- 📥 **Export to TXT** – Download transcriptions with timestamps
- 🔄 **Retry logic** – Handles transient network failures gracefully

---

## Architecture & Design Decisions

### Service Layer Architecture

The app separates concerns into three distinct services:

```
src/services/
├── AudioTranscriptionService.js  # File validation & preparation
├── AudioChunkingService.js       # Audio splitting logic
└── GroqTranscriptionService.js   # API communication & orchestration
```

**Why this separation?**
- **Single Responsibility**: Each service handles one concern
- **Testability**: Services can be unit tested independently
- **Reusability**: Chunking logic can be reused for other audio processing

### Client-Side Chunking (Web Audio API)

Large audio files are split client-side using the Web Audio API instead of server-side processing.

```javascript
const audioContext = new AudioContext();
const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
// Split into 5-minute chunks
```

**Why client-side?**
- **Reduces server load** – No heavy audio processing on the server
- **Lower bandwidth** – Only necessary chunks are uploaded
- **No FFmpeg dependency** – Works in browser without native binaries
- **Serverless compatible** – Works with Vercel/edge functions

**Trade-off**: Requires browser support for Web Audio API (all modern browsers).

### API Route as Proxy

The `/api/transcribe` route acts as a proxy to Groq's API:

```
Client → Next.js API Route → Groq Whisper API
```

**Why not call Groq directly from client?**
- **Security** – API key stays server-side, never exposed to browser
- **Rate limiting** – Can add request throttling at the proxy layer
- **Error handling** – Centralized error transformation and logging
- **Flexibility** – Can switch providers without client changes

### Retry with Exponential Backoff

Network requests include automatic retry logic:

```javascript
async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (isRetryable(error) && attempt < retries) {
        await sleep(1000 * attempt); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}
```

**Why?**
- Groq API occasionally times out under load
- `ETIMEDOUT` and `ECONNRESET` are transient and recoverable
- Exponential backoff prevents thundering herd

### Verbose JSON for Timestamps

Uses Groq's `verbose_json` response format instead of plain `json`:

```javascript
groqFormData.append("response_format", "verbose_json");
// Returns: { text, segments: [{ start, end, text }] }
```

**Why?**
- Enables per-segment timestamps without additional API calls
- Supports timestamped export feature
- Small overhead (~10% larger response)

### Chunk Timestamp Offsetting

When transcribing chunked audio, segment timestamps are adjusted:

```javascript
if (timeOffset > 0) {
  segments = segments.map(seg => ({
    ...seg,
    start: seg.start + timeOffset,
    end: seg.end + timeOffset,
  }));
}
```

**Why?**
- Each chunk starts at 0:00 from Whisper's perspective
- Offset ensures continuous timestamps across the full audio
- Example: Chunk 2 (starts at 5:00) → segments offset by 300 seconds

### Format Validation Strategy

Two-tier format handling:

| Tier | Formats | Action |
|------|---------|--------|
| **Native** | mp3, mp4, wav, webm, m4a | Send directly to API |
| **Convertible** | ogg, flac, aac, wma | Flag for conversion (future) |

**Why flag instead of convert?**
- Conversion requires FFmpeg or WebAssembly library
- Keeps initial implementation simple
- UI warns user; they can convert externally

### State Management

Uses React's `useState` for local state rather than a state management library:

```javascript
const [file, setFile] = useState(null);
const [transcription, setTranscription] = useState(null);
const [isTranscribing, setIsTranscribing] = useState(false);
```

**Why no Redux/Zustand?**
- Single-page app with localized state
- No cross-component state sharing needed
- Reduces bundle size and complexity

### Progress Callbacks

Services accept an `onProgress` callback for real-time UI updates:

```javascript
transcribeAudio(file, {
  onProgress: ({ status, message, progress }) => {
    setTranscriptionStatus(message);
    setTranscriptionProgress(progress);
  }
});
```

**Why callbacks over events?**
- Simpler API contract
- No event listener cleanup needed
- Works naturally with React's render cycle

---

## Getting Started

### Prerequisites

- Node.js 18+
- Groq API key ([get one here](https://console.groq.com))

### Installation

```bash
# Clone the repository
git clone https://github.com/saad-datapulse/Audio-transcription.git
cd Audio-transcription

# Install dependencies
npm install

# Set up environment variables
echo "GROQ_API_KEY=your_api_key_here" > .env

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GROQ_API_KEY` | Your Groq API key | Yes |

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── transcribe/
│   │       └── route.js      # API proxy to Groq
│   ├── page.js               # Main UI component
│   ├── layout.js             # Root layout
│   └── globals.css           # Tailwind styles
└── services/
    ├── AudioTranscriptionService.js  # Validation & file prep
    ├── AudioChunkingService.js       # Web Audio chunking
    └── GroqTranscriptionService.js   # Transcription logic
```

---

## API Limits

| Limit | Value | Handling |
|-------|-------|----------|
| Max file size | 25 MB | Auto-chunking |
| Max duration | ~5 min per chunk | Auto-chunking |
| Supported formats | mp3, mp4, wav, etc. | Validation |

---

## Future Improvements

- [ ] Audio format conversion (FFmpeg.wasm)
- [ ] Concurrent upload queue
- [ ] Speaker diarization
- [ ] SRT/VTT subtitle export
- [ ] Audio recording from microphone

---

## License

MIT
