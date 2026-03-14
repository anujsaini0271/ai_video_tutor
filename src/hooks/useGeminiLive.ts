import { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

export interface UseGeminiLiveProps {
  systemInstruction?: string;
  onTranscript?: (text: string, isUser: boolean) => void;
  onInterrupted?: () => void;
  onSpeechEnd?: () => void;
}

export function useGeminiLive({ systemInstruction, onTranscript, onInterrupted, onSpeechEnd }: UseGeminiLiveProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);

  const stopAudio = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      if (isPlayingRef.current === false) {
        // Queue is empty and nothing is playing
        onSpeechEnd?.();
      }
      return;
    }

    if (isPlayingRef.current || !audioContextRef.current) {
      return;
    }

    isPlayingRef.current = true;
    const pcmData = audioQueueRef.current.shift()!;
    const audioBuffer = audioContextRef.current.createBuffer(1, pcmData.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 32768.0;
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      if (audioQueueRef.current.length === 0) {
        onSpeechEnd?.();
      } else {
        playNextInQueue();
      }
    };
    source.start();
  }, [onSpeechEnd]);

  const connect = useCallback(async () => {
    if (isConnected || isConnecting) return;
    setIsConnecting(true);

    try {
      console.log("API Key present:", !!process.env.GEMINI_API_KEY);
      console.log("Modality.AUDIO:", Modality.AUDIO);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction,
        },
        callbacks: {
          onopen: async () => {
            setIsConnected(true);
            setIsConnecting(false);
            
            // Setup audio capture
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
            processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

            processorRef.current.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmData = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
              }
              
              const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
              sessionPromise.then((session) => {
                session.sendRealtimeInput({
                  media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                });
              });
            };

            sourceRef.current.connect(processorRef.current);
            processorRef.current.connect(audioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const pcmData = new Int16Array(bytes.buffer);
              audioQueueRef.current.push(pcmData);
              playNextInQueue();
            }

            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              onInterrupted?.();
            }

            // Handle transcriptions
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
               onTranscript?.(message.serverContent.modelTurn.parts[0].text, false);
            }
          },
          onclose: () => {
            stopAudio();
          },
          onerror: (err) => {
            console.error("Gemini Live Error:", err);
            stopAudio();
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Failed to connect to Gemini Live:", err);
      setIsConnecting(false);
    }
  }, [isConnected, isConnecting, systemInstruction, onTranscript, onInterrupted, playNextInQueue, stopAudio]);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    stopAudio();
  }, [stopAudio]);

  const sendVisualContext = useCallback((base64Image: string, text: string) => {
    if (!sessionRef.current) return;
    
    if (base64Image) {
      sessionRef.current.sendRealtimeInput({
        media: { data: base64Image, mimeType: 'image/jpeg' }
      });
    }
    
    if (text) {
      sessionRef.current.sendRealtimeInput({
        text
      });
    }
  }, []);

  return { isConnected, isConnecting, connect, disconnect, sendVisualContext };
}
