// frontend/src/vite-env.d.ts

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // Add any other VITE_ variables you use here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}