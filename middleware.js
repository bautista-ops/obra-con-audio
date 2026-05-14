import { NextResponse } from 'next/server'

export function middleware(request) {
  const { pathname } = request.nextUrl

  // Rutas que no necesitan auth
  if (pathname.startsWith('/api/') || pathname === '/login') {
    return NextResponse.next()
  }

  // Verificar cookie de sesión
  const session = request.cookies.get('msh_session')
  if (!session || session.value !== process.env.APP_PASSWORD) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png).*)'],
}
