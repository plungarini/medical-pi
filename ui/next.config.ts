import type { NextConfig } from "next";

// UI runs on PORT, API runs on PORT + 1000
const BASE_PORT = parseInt(process.env.PORT || "3003", 10);
const API_PORT = BASE_PORT + 1000;

const nextConfig: NextConfig = {
  // Ensure UI can find dependencies from root
  transpilePackages: ['@assistant-ui/react', '@assistant-ui/react-ai-sdk', '@assistant-ui/react-markdown'],
  // API proxy is handled by app/api/server route handler
  turbopack: {
    root: '..',
  },
};

export default nextConfig;
