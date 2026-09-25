import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// VITE_MOCK=1 troca o cliente do Supabase por dados de demonstração
// (src/dev/mockSupabase.js) para rever o visual sem iniciar sessão.
const mock = String(process.env.VITE_MOCK ?? '').trim() === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: mock
    ? {
        alias: [
          {
            find: /^(?:\.{1,2}\/)+lib\/supabaseClient\.js$/,
            replacement: fileURLToPath(new URL('./src/dev/mockSupabase.js', import.meta.url)),
          },
        ],
      }
    : {},
})
