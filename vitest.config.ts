import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["server/src/tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", "ui"],
    env: {
      JWT_SECRET: "test-secret-key-for-testing-only",
      MODAL_ENDPOINT: "http://localhost:3000",
      OPENROUTER_API_KEY: "test-key",
      BASE_STORAGE_PATH: "/tmp/medical-pi-test",
    },
  },
});
