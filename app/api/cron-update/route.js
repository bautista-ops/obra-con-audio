export const maxDuration = 60

async function getGoogleAccessToken() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  // Crear JWT manualmente
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const body = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const unsigned = `${header}.${body}`

  // Importar la clave privada y firmar
  const privateKey = credentials.private_key
  const keyData = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const encoder = new TextEncoder()
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(unsigned))
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${unsigned}.${sig}`

  // Intercambiar JWT por access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })

  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

export async function GET(request) {
  // Verificar que viene de Vercel Cron
  // Auth temporalmente desactivada para debug

  try {
    const accessToken = await getGoogleAccessToken()
    const DRIVE_FILE_ID = '1dVtf30uD0J5wKr9lT2IHKCKXb68WaBn1'

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${DRIVE_FILE_ID}/export?mimeType=text/csv`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!driveRes.ok) {
      const err = await driveRes.text()
      return Response.json({ error: 'No se pudo leer el Drive', detalle: err }, { status: 500 })
    }

    const csv = await driveRes.text()
    const lineas = csv.split('\n').filter(l => l.trim())

    const obras = []
    for (let i = 1; i < lineas.length && i < 200; i++) {
      const cols = lineas[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
      if (cols[0] && cols[0].match(/\d{4}/)) {
        obras.push(cols.slice(0, 6).join(' | '))
      }
    }

    console.log(`[CRON] Update exitoso — ${obras.length} obras leídas del Drive`)

    return Response.json({
      ok: true,
      obras_encontradas: obras.length,
      muestra: obras.slice(0, 5),
      fecha: new Date().toISOString()
    })

  } catch (error) {
    console.error('[CRON] Error:', error)
    return Response.json({ error: error?.message }, { status: 500 })
  }
}
