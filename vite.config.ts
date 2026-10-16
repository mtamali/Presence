import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// defineConfig must come from 'vitest/config', not 'vite' — the one exported by
// 'vite' has no `test` property in its type and `tsc -b` fails on it.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
})
