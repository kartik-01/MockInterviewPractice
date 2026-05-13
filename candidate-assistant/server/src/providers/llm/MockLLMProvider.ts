import type { LLMProvider } from "./LLMProvider.js";

const MOCK =
  "I'd start by clarifying requirements and constraints, then outline a minimal design that meets them with clear tradeoffs. For example, I'd pick a simple data model, explain how requests flow, and call out where I'd add caching or scaling if load grew. The main tradeoff is operational complexity versus latency. ";

export class MockLLMProvider implements LLMProvider {
  async streamAnswer(
    _question: string,
    onToken: (token: string) => void,
  ): Promise<void> {
    const parts = MOCK.split(/(\s+)/);
    for (const p of parts) {
      if (!p) continue;
      onToken(p);
      await new Promise((r) => setTimeout(r, 12));
    }
  }
}
