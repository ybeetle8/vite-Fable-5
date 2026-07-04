import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    port: 62001,
    proxy: {
      '/api': 'http://localhost:62002',
      '/socket.io': {
        target: 'http://localhost:62002',
        ws: true,
      },
    },
  },
})
