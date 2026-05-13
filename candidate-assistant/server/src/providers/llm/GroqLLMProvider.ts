import type { LLMProvider } from "./LLMProvider.js";
import { buildAnswerPrompt } from "../../services/answerPrompt.js";
import {
  ANSWER_MAX_TOKENS,
  GROQ_API_KEY,
  GROQ_MODEL,
} from "../../config.js";
import Groq from "groq-sdk";

export class GroqLLMProvider implements LLMProvider {
  async streamAnswer(
    question: string,
    onToken: (token: string) => void,
  ): Promise<void> {
    const groq = new Groq({ apiKey: GROQ_API_KEY });
    const stream = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.35,
      max_tokens: ANSWER_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: buildAnswerPrompt(question),
        },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? "";
      if (token) onToken(token);
    }
  }
}
