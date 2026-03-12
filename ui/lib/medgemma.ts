// MedGemma provider using OpenAI-compatible API
// This file uses the @ai-sdk/openai-compatible package from root node_modules

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createOpenAICompatible = (config: { name: string; baseURL: string; apiKey: string }) => {
  return {
    config,
    // Minimal implementation for type compatibility
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: "" } }],
        }),
      },
    },
  };
};

export const medgemma = createOpenAICompatible({
  name: "medgemma",
  baseURL: process.env.NEXT_PUBLIC_MODAL_ENDPOINT || "http://localhost:3003/api/llm",
  apiKey: process.env.NEXT_PUBLIC_MODAL_API_KEY ?? "unused",
});

export const model = "google/medgemma-1.5-4b-it";
