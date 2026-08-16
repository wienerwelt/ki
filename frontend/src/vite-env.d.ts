// frontend/src/vite-env.d.ts

/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // Add any other VITE_ variables you use here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
