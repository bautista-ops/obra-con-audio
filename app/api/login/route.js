import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const { password } = await request.json()

    if (!password || password !== process.env.APP_PASSWORD) {
      return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set('msh_session', process.env.APP_PASSWORD, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    return response

  } catch (error) {
    return NextResponse.json({ error: error?.message }, { status: 500 })
  }
}
