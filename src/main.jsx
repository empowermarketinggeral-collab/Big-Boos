import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'

const queryClient = new QueryClient()

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error(error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', padding: 20 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 18 }}>Ocorreu um erro inesperado</h1>
            <p style={{ color: '#666', fontSize: 14 }}>
              Tenta recarregar a página. Se o problema persistir, contacta o suporte.
            </p>
            {import.meta.env.DEV && (
              <pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left', fontSize: 11, color: '#b00', marginTop: 16 }}>
                {String((this.state.error && this.state.error.stack) || this.state.error)}
              </pre>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
