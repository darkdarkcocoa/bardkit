import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  // Set DEMO_BASE (e.g. "/bardkit/") when deploying under a sub-path.
  base: process.env.DEMO_BASE ?? '/',
  plugins: [svelte()],
  server: { port: 5178, host: true },
  build: { target: 'esnext' },
})
