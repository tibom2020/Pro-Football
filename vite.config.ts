
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Define process.env.API_KEY for client-side access, as required by @google/genai
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
  },
})