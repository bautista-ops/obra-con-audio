export const maxDuration = 60

// Este endpoint lo llama Vercel Cron todos los lunes a las 6am
// Lee el AVANCE DE OBRAS del Drive y actualiza el contexto de obras en el system prompt cache

export async function GET(request) {
  // Verificar que viene de Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    // Leer AVANCE DE OBRAS desde Google Drive via API
    const DRIVE_FILE_ID = '1dVtf30uD0J5wKr9lT2IHKCKXb68WaBn1'
    const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN

    if (!GOOGLE_ACCESS_TOKEN) {
      return Response.json({ error: 'Falta GOOGLE_ACCESS_TOKEN' }, { status: 500 })
    }

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${DRIVE_FILE_ID}/export?mimeType=text/csv`,
      { headers: { Authorization: `Bearer ${GOOGLE_ACCESS_TOKEN}` } }
    )

    if (!driveRes.ok) {
      return Response.json({ error: 'No se pudo leer el Drive', status: driveRes.status }, { status: 500 })
    }

    const csv = await driveRes.text()

    // Parsear las primeras filas del CSV para extraer obras activas
    const lineas = csv.split('\n').filter(l => l.trim())
    const obras = []

    for (let i = 1; i < lineas.length && i < 100; i++) {
      const cols = lineas[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
      if (cols[0] && cols[0].match(/\d{4}/)) {
        obras.push(cols.slice(0, 5).join(' | '))
      }
    }

    // Loguear para monitoreo — en producción esto iría a una DB o archivo
    console.log(`[CRON] Lunes update — ${obras.length} obras leídas del Drive`)
    console.log(obras.slice(0, 5).join('\n'))

    return Response.json({
      ok: true,
      obras_encontradas: obras.length,
      muestra: obras.slice(0, 3),
      fecha: new Date().toISOString()
    })

  } catch (error) {
    console.error('[CRON] Error:', error)
    return Response.json({ error: error?.message }, { status: 500 })
  }
}
