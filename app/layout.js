import './globals.css'

export const metadata = {
  title: 'MSH — Asistente de obra',
  description: 'Minutas y no conformidades para el equipo de obra de Grupo MSH',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
