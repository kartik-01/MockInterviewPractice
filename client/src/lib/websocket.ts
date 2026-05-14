const DEFAULT_WS = "ws://localhost:3001/ws/listen";

export function getListenWebSocketUrl(): string {
  return import.meta.env.VITE_WS_URL ?? DEFAULT_WS;
}

export function openListenSocket(): WebSocket {
  return new WebSocket(getListenWebSocketUrl());
}
