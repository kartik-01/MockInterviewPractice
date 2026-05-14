import { useCallback, useRef, useState } from "react";
import {
  acquireMicAndAudioContext,
  startPcmStreamingFromStream,
} from "../lib/audio";
import { openListenSocket } from "../lib/websocket";
import { parseServerMessage, type UiState } from "../types";

export function useCandidateAssistant() {
  const [uiState, setUiState] = useState<UiState>("idle");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<{ stop: () => void } | null>(null);
  const allowSendRef = useRef(false);

  const cleanupAudio = useCallback(() => {
    allowSendRef.current = false;
    audioRef.current?.stop();
    audioRef.current = null;
  }, []);

  const detachWs = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    wsRef.current = null;
  }, []);

  const closeWs = useCallback(() => {
    const ws = wsRef.current;
    detachWs();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    } else if (ws && ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }, [detachWs]);

  const handleMessage = useCallback(
    (ev: MessageEvent) => {
      const msg = parseServerMessage(String(ev.data));
      if (!msg) return;

      switch (msg.type) {
        case "status": {
          setUiState(msg.state);
          if (msg.state === "listening") {
            allowSendRef.current = true;
          }
          break;
        }
        case "transcript_partial":
        case "transcript_final":
          setTranscript(msg.text);
          break;
        case "answer_token":
          setAnswer((a) => a + msg.token);
          break;
        case "answer_done":
          break;
        case "stop_listening":
          allowSendRef.current = false;
          cleanupAudio();
          break;
        case "error":
          setError(msg.message);
          allowSendRef.current = false;
          cleanupAudio();
          break;
        default:
          break;
      }
    },
    [cleanupAudio],
  );

  const startListen = useCallback(async () => {
    setError(null);
    setTranscript("");
    setAnswer("");
    setUiState("listening");
    allowSendRef.current = false;

    closeWs();
    cleanupAudio();

    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;

    try {
      const mic = await acquireMicAndAudioContext();
      stream = mic.stream;
      audioContext = mic.audioContext;
    } catch (e) {
      const m =
        e instanceof Error ? e.message : "Microphone permission denied";
      setError(m);
      setUiState("error");
      return;
    }

    const ws = openListenSocket();
    wsRef.current = ws;

    ws.onmessage = (e) => {
      handleMessage(e);
    };

    ws.onerror = () => {
      setError("WebSocket connection failed");
      setUiState("error");
      cleanupAudio();
      stream?.getTracks().forEach((t) => t.stop());
      void audioContext?.close().catch(() => {});
      detachWs();
    };

    ws.onclose = () => {
      if (!audioRef.current && stream) {
        stream.getTracks().forEach((t) => t.stop());
        void audioContext?.close().catch(() => {});
      }
    };

    ws.onopen = () => {
      void (async () => {
        if (!stream || !audioContext || wsRef.current !== ws) {
          return;
        }
        await audioContext.resume().catch(() => {});
        if (audioContext.state !== "running") {
          setError(
            `Audio is blocked (${audioContext.state}). Click Listen again or check site permissions.`,
          );
          setUiState("error");
          stream.getTracks().forEach((t) => t.stop());
          await audioContext.close().catch(() => {});
          ws.close();
          detachWs();
          return;
        }
        try {
          const audio = startPcmStreamingFromStream(
            stream,
            audioContext,
            (b64) => {
              if (
                wsRef.current === ws &&
                ws.readyState === WebSocket.OPEN &&
                allowSendRef.current
              ) {
                ws.send(JSON.stringify({ type: "audio_chunk", audio: b64 }));
              }
            },
          );
          audioRef.current = audio;
          ws.send(
            JSON.stringify({
              type: "start_listening",
              sampleRate: audio.sampleRate,
            }),
          );
          allowSendRef.current = true;
        } catch (e) {
          const m =
            e instanceof Error ? e.message : "Could not start audio capture";
          setError(m);
          setUiState("error");
          cleanupAudio();
          stream.getTracks().forEach((t) => t.stop());
          await audioContext.close().catch(() => {});
          ws.close();
          detachWs();
        }
      })();
    };
  }, [cleanupAudio, closeWs, detachWs, handleMessage]);

  const stopListen = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "stop_listening" }));
    }
    cleanupAudio();
  }, [cleanupAudio]);

  const clear = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "clear" }));
    }
    cleanupAudio();
    setTranscript("");
    setAnswer("");
    setError(null);
    setUiState("idle");
  }, [cleanupAudio]);

  return {
    uiState,
    transcript,
    answer,
    error,
    startListen,
    stopListen,
    clear,
  };
}
