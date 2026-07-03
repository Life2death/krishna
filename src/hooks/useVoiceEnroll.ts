import { useState, useRef, useCallback } from "react";
import { enrollVoice } from "@/lib/voice-client";

export interface VoiceEnrollState {
  recording: boolean;
  enrolling: boolean;
  error: string | null;
  result: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

export function useVoiceEnroll(onEnrolled?: () => Promise<void>): VoiceEnrollState {
  const [recording, setRecording] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => { t.stop(); t.enabled = false; });
      streamRef.current = null;
    }
  }, []);

  const handleEnroll = useCallback(async () => {
    const chunks = [...chunksRef.current];
    cleanup();
    if (chunks.length === 0) return;
    setEnrolling(true);
    setError(null);
    try {
      const recordedBlob = new Blob(chunks, { type: "audio/webm" });
      const arrayBuffer = await recordedBlob.arrayBuffer();
      const audioCtx = new AudioContext();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();
      const offline = new OfflineAudioContext(
        1,
        Math.max(1, Math.ceil(decoded.duration * 16000)),
        16000,
      );
      const srcNode = offline.createBufferSource();
      srcNode.buffer = decoded;
      srcNode.connect(offline.destination);
      srcNode.start();
      const rendered = await offline.startRendering();
      const pcm16k = rendered.getChannelData(0);
      const enrollResult = await enrollVoice(pcm16k, 16000);
      setResult(`Enrolled (${enrollResult.sampleCount} sample${enrollResult.sampleCount > 1 ? "s" : ""}, ${enrollResult.dims} dims)`);
      await onEnrolled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrollment failed");
    } finally {
      setEnrolling(false);
    }
  }, [cleanup, onEnrolled]);

  const start = useCallback(async () => {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => handleEnroll();
      recorder.start(100);
      setRecording(true);
    } catch (err) {
      setError("Microphone access denied");
    }
  }, [handleEnroll]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  return { recording, enrolling, error, result, start, stop };
}
