import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// defineConfig must come from 'vitest/config', not 'vite' — the one exported by
// 'vite' has no `test` property in its type and `tsc -b` fails on it.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api/badges': 'http://127.0.0.1:8765' },
  },
  test: {
    environment: 'jsdom',
  },
})
