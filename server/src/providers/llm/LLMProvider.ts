export interface LLMProvider {
  streamAnswer(question: string, onToken: (token: string) => void): Promise<void>;
}
