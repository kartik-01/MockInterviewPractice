import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { CLIENT_ORIGIN, PORT } from "./config.js";
import { registerListenSocket } from "./websocket/listenSocket.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: CLIENT_ORIGIN,
  methods: ["GET", "OPTIONS"],
});

await app.register(websocket);

app.get("/health", async () => ({ ok: true }));

registerListenSocket(app);

await app.listen({ port: PORT, host: "0.0.0.0" });
