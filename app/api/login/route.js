export async function POST(request) {
  try {
    const { password } = await request.json()

    if (!password || password !== process.env.APP_PASSWORD) {
      return Response.json({ error: 'Contraseña incorrecta' }, { status: 401 })
    }

    const response = Response.json({ ok: true })
    response.headers.set(
      'Set-Cookie',
      `msh_session=${process.env.APP_PASSWORD}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}`
    )
    return response
  } catch (error) {
    return Response.json({ error: error?.message }, { status: 500 })
  }
}
