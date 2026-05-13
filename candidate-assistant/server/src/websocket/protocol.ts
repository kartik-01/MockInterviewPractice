import { z } from "zod";

export const StartListeningMessageSchema = z.object({
  type: z.literal("start_listening"),
  sampleRate: z.number().int().positive().max(192_000).optional(),
});

export const AudioChunkMessageSchema = z.object({
  type: z.literal("audio_chunk"),
  audio: z.string().min(1),
});

export const StopListeningMessageSchema = z.object({
  type: z.literal("stop_listening"),
});

export const ClearMessageSchema = z.object({
  type: z.literal("clear"),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  StartListeningMessageSchema,
  AudioChunkMessageSchema,
  StopListeningMessageSchema,
  ClearMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export function parseClientMessage(raw: unknown):
  | { ok: true; message: ClientMessage }
  | { ok: false; error: string } {
  const r = ClientMessageSchema.safeParse(raw);
  if (!r.success) {
    return { ok: false, error: r.error.flatten().formErrors.join("; ") };
  }
  return { ok: true, message: r.data };
}
