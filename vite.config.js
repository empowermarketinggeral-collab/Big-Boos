import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// VITE_MOCK=1 troca o cliente do Supabase por dados de demonstração
// (src/dev/mockSupabase.js) para rever o visual sem iniciar sessão.
const mock = String(process.env.VITE_MOCK ?? '').trim() === '1'

// App de uma marca com endereço próprio (ex: dreams-studio.vercel.app):
// um segundo projeto no Vercel, a partir deste repositório, com
// VITE_CLIENT_APP_SLUG=<booking_slug> e VITE_CLIENT_APP_NAME=<nome>.
// O index.html passa a ter o nome, o ícone e o manifesto da marca
// (public/apps/<slug>/), para "instalar app" no telemóvel instalar a
// app da marca e não o Big Boss.
const clientAppSlug = String(process.env.VITE_CLIENT_APP_SLUG ?? '').trim()
const clientAppName = String(process.env.VITE_CLIENT_APP_NAME ?? '').trim() || clientAppSlug
const clientAppColor = String(process.env.VITE_CLIENT_APP_COLOR ?? '').trim() || 'white'

function clientAppHtml() {
  return {
    name: 'client-app-html',
    transformIndexHtml(html) {
      if (!clientAppSlug) return html
      const base = `/apps/${clientAppSlug}`
      return html
        .replace(/<title>[^<]*<\/title>/, `<title>${clientAppName}</title>`)
        .replace(/<link rel="manifest"[^>]*>/, `<link rel="manifest" href="${base}/manifest.webmanifest" />`)
        .replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png" />`)
        .replace(/<link rel="icon" href="\/favicon\.ico"[^>]*>/, `<link rel="icon" type="image/png" href="${base}/favicon-64.png" />`)
        .replace(/<link rel="icon" type="image\/svg\+xml"[^>]*>\s*/, '')
        .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*"/, `<meta name="apple-mobile-web-app-title" content="${clientAppName}"`)
        .replace(/<meta name="theme-color" content="[^"]*"/, `<meta name="theme-color" content="${clientAppColor}"`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), clientAppHtml()],
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
