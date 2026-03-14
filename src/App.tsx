import React, { useState, useEffect, useCallback, useRef } from 'react';
import { YoutubePlayer } from './components/YoutubePlayer';
import { useGeminiLive } from './hooks/useGeminiLive';
import { Play, Pause, Mic, MicOff, Send, Video, BookOpen, MessageSquare, Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export default function App() {
  const [videoUrl, setVideoUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [videoId, setVideoId] = useState('dQw4w9WgXcQ');
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSegment, setCurrentSegment] = useState<TranscriptSegment | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isFetchingTranscript, setIsFetchingTranscript] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<{ text: string; isUser: boolean }[]>([]);

  const systemInstruction = `You are an AI tutor watching a YouTube video with the user.
You receive the current transcript segment (if available), timestamp, and context.
Explain the concept shown in the video clearly and simply, like a teacher.
Use the transcript context to provide accurate explanations.
If transcripts are unavailable, rely on the user's questions and general knowledge about the video topic.
If the user asks a question, pause and explain.
Keep your responses concise and beginner-friendly.`;

  const onTranscript = useCallback((text: string, isUser: boolean) => {
    setChatHistory(prev => [...prev, { text, isUser }]);
    if (!isUser) {
      setAiResponse(text);
    }
  }, []);

  const onInterrupted = useCallback(() => {
    // Handle interruption if needed
  }, []);

  const onSpeechEnd = useCallback(() => {
    if (player) {
      player.playVideo();
    }
  }, [player]);

  const { isConnected, isConnecting, connect, disconnect, sendVisualContext } = useGeminiLive({
    systemInstruction,
    onTranscript,
    onInterrupted,
    onSpeechEnd
  });

  const extractVideoId = (url: string) => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  };

  const handleLoadVideo = () => {
    const id = extractVideoId(videoUrl);
    if (id) {
      setVideoId(id);
      setTranscript([]);
      setChatHistory([]);
      setAiResponse('');
      fetchTranscript(id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLoadVideo();
    }
  };

  const fetchTranscript = async (id: string) => {
    setIsFetchingTranscript(true);
    setTranscript([]);
    setTranscriptError(null);
    try {
      const response = await fetch(`/api/transcript?videoId=${id}`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setTranscript(data);
      } else if (data.error) {
        setTranscriptError(data.details || data.error);
        console.error("Transcript API error:", data.error);
      }
    } catch (error) {
      setTranscriptError("Failed to connect to transcript service.");
      console.error("Error fetching transcript:", error);
    } finally {
      setIsFetchingTranscript(false);
    }
  };

  useEffect(() => {
    fetchTranscript(videoId);
  }, []);

  useEffect(() => {
    const segment = transcript.find(s => currentTime >= s.start && currentTime < s.start + s.duration);
    if (segment && segment !== currentSegment) {
      setCurrentSegment(segment);
    }
  }, [currentTime, transcript, currentSegment]);

  const getContextWindow = (time: number) => {
    const windowSize = 10; // 10 seconds before and after
    return transcript
      .filter(s => s.start >= time - windowSize && s.start <= time + windowSize)
      .map(s => s.text)
      .join(' ');
  };

  const handleAskGemini = async () => {
    if (!isConnected) {
      await connect();
    }

    if (player) {
      player.pauseVideo();
    }

    const context = transcript.length > 0 ? getContextWindow(currentTime) : "NO TRANSCRIPT AVAILABLE FOR THIS VIDEO.";
    const prompt = `Current Timestamp: ${Math.floor(currentTime)}s\nTranscript Context: ${context}\n\nPlease explain what is happening or answer the user's question based on this context. ${transcript.length === 0 ? "Note: Transcripts are disabled for this video, so please rely on general knowledge or any visual cues if provided." : ""}`;
    
    // In a real scenario with CORS-enabled video, we would capture a frame here.
    // For YouTube IFrame, we send the transcript context.
    sendVisualContext('', prompt);
  };

  const toggleConnection = () => {
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif italic tracking-tight">AI Video Tutor</h1>
          <p className="text-xs uppercase tracking-widest opacity-50 mt-1">Real-time Multimodal Learning</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex bg-white border border-[#141414] rounded-full px-4 py-2 w-96">
            <input 
              type="text" 
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste YouTube URL..."
              className="flex-1 bg-transparent outline-none text-sm"
            />
            <button onClick={handleLoadVideo} className="ml-2 opacity-50 hover:opacity-100 transition-opacity">
              <Video size={18} />
            </button>
          </div>
          <button 
            onClick={toggleConnection}
            className={cn(
              "px-6 py-2 rounded-full border border-[#141414] text-sm font-medium transition-all flex items-center gap-2",
              isConnected ? "bg-[#141414] text-[#E4E3E0]" : "bg-white hover:bg-[#141414] hover:text-[#E4E3E0]"
            )}
          >
            {isConnecting ? <Loader2 size={16} className="animate-spin" /> : (isConnected ? <Mic size={16} /> : <MicOff size={16} />)}
            {isConnected ? "Live" : "Connect Voice"}
          </button>
        </div>
      </header>

      <main className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-120px)]">
        {/* Left Panel: Video Player */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="flex-1 min-h-0">
            <YoutubePlayer 
              videoId={videoId} 
              onTimeUpdate={setCurrentTime}
              onPlayerReady={setPlayer}
            />
          </div>
          
          {/* Transcript Preview */}
          <div className="bg-white border border-[#141414] p-6 rounded-2xl shadow-sm h-48 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4 opacity-50">
              <BookOpen size={16} />
              <span className="text-xs uppercase tracking-widest font-bold">Live Transcript</span>
            </div>
            {isFetchingTranscript ? (
              <div className="flex items-center gap-2 text-sm opacity-50 italic">
                <Loader2 size={14} className="animate-spin" />
                Fetching captions...
              </div>
            ) : transcriptError ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <div className="text-amber-600 mb-2">
                  <Video size={24} className="mx-auto opacity-50" />
                </div>
                <p className="text-sm font-medium text-amber-800">Captions Unavailable</p>
                <p className="text-xs text-amber-600/70 mt-1 max-w-xs">
                  {transcriptError.includes('disabled') 
                    ? "Transcripts are disabled for this video. The AI Tutor will have limited context." 
                    : "We couldn't load the transcript for this video."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {transcript.length === 0 && !isFetchingTranscript && (
                  <p className="text-sm opacity-50 italic text-center py-8">No transcript data found.</p>
                )}
                {transcript.map((s, i) => (
                  <p 
                    key={i} 
                    className={cn(
                      "text-sm transition-opacity",
                      currentSegment === s ? "opacity-100 font-medium" : "opacity-30"
                    )}
                  >
                    <span className="font-mono text-[10px] mr-3">[{Math.floor(s.start)}s]</span>
                    {s.text}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: AI Interaction */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="flex-1 bg-white border border-[#141414] rounded-2xl shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#141414] flex justify-between items-center bg-[#141414] text-[#E4E3E0]">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} />
                <span className="text-xs uppercase tracking-widest font-bold">AI Tutor Explanation</span>
              </div>
              {isConnected && <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
            </div>
            
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              {chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                  <div className="w-16 h-16 rounded-full border border-[#141414] flex items-center justify-center mb-4">
                    <Mic size={24} />
                  </div>
                  <p className="text-sm italic">Connect voice and ask "Explain this" to start learning.</p>
                </div>
              ) : (
                chatHistory.map((msg, i) => (
                  <div key={i} className={cn(
                    "flex flex-col",
                    msg.isUser ? "items-end" : "items-start"
                  )}>
                    <span className="text-[10px] uppercase tracking-widest opacity-50 mb-1">
                      {msg.isUser ? "You" : "Gemini Tutor"}
                    </span>
                    <div className={cn(
                      "max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed",
                      msg.isUser ? "bg-[#141414] text-[#E4E3E0]" : "bg-[#F5F5F0] border border-[#141414]/10"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-6 border-t border-[#141414] bg-[#F5F5F0]">
              <button 
                onClick={handleAskGemini}
                disabled={!isConnected}
                className={cn(
                  "w-full py-4 rounded-xl border border-[#141414] flex items-center justify-center gap-3 transition-all",
                  isConnected 
                    ? "bg-[#141414] text-[#E4E3E0] hover:scale-[1.02] active:scale-[0.98]" 
                    : "bg-white opacity-50 cursor-not-allowed"
                )}
              >
                <Mic size={20} />
                <span className="font-medium">Ask Gemini to Explain</span>
              </button>
              <p className="text-[10px] text-center mt-3 opacity-40 uppercase tracking-tighter">
                Voice interaction is active. You can also just speak to the tutor.
              </p>
            </div>
          </div>

          {/* Context Info */}
          <div className="bg-[#141414] text-[#E4E3E0] p-6 rounded-2xl shadow-lg">
            <h3 className="text-xs uppercase tracking-widest font-bold mb-4 opacity-50">Current Context</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-[10px] opacity-50">TIMESTAMP</span>
                <span className="font-mono text-sm">{Math.floor(currentTime)}s</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-[10px] opacity-50">VIDEO ID</span>
                <span className="font-mono text-sm">{videoId}</span>
              </div>
              <div className="pt-2">
                <span className="text-[10px] opacity-50 block mb-2">ACTIVE SEGMENT</span>
                <p className="text-xs italic leading-relaxed opacity-80">
                  "{currentSegment?.text || "No active caption"}"
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
