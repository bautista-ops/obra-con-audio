'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      if (res.ok) {
        window.location.href = '/'
      } else {
        setError('Contraseña incorrecta')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{
      minHeight: '100vh', background: '#f5f4f0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '40px 32px',
        width: '100%', maxWidth: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.08)'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{
            background: '#1a1a1a', borderRadius: 8, padding: '8px 12px',
            fontFamily: 'Courier New, monospace', fontWeight: 'bold',
            fontSize: 18, color: '#c8a96e', letterSpacing: 3
          }}>MSH</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a1a' }}>Asistente de Obra</div>
            <div style={{ fontSize: 12, color: '#aaa' }}>Acceso interno</div>
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ingresá la contraseña"
              autoFocus
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 8,
                border: `1px solid ${error ? '#c0392b' : '#e0ddd8'}`,
                fontSize: 15, outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.15s'
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: '#c0392b', margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              padding: '13px', background: loading || !password ? '#e0ddd8' : '#c8a96e',
              border: 'none', borderRadius: 8, color: loading || !password ? '#aaa' : '#1a1a1a',
              fontSize: 15, fontWeight: 600, cursor: loading || !password ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s'
            }}
          >
            {loading ? 'Verificando...' : 'Ingresar →'}
          </button>
        </form>
      </div>
    </main>
  )
}
