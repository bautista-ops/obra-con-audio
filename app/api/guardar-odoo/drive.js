/**
 * drive.js — Google Drive upload via OAuth2 refresh token
 * Sin dependencias externas.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

// ── Auth ──────────────────────────────────────────────────
async function getAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) {
    console.error('[drive] Auth error:', JSON.stringify(data).substring(0, 300))
  }
  return data.access_token || null
}

// ── Helpers ───────────────────────────────────────────────
async function buscarCarpeta(token, parentId, nombre) {
  const q = encodeURIComponent(
    `'${parentId}' in parents and name = '${nombre.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  )
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return data.files?.[0] || null
}

async function crearCarpeta(token, parentId, nombre) {
  const res = await fetch(`${DRIVE_API}/files?supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: nombre,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  const data = await res.json()
  if (!data.id) console.error('[drive] Error creando carpeta:', JSON.stringify(data).substring(0, 300))
  return data.id ? data : null
}

async function contarMinutas(token, folderId) {
  const q = encodeURIComponent(
    `'${folderId}' in parents and name contains 'Minuta_' and trashed = false`
  )
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return data.files?.length || 0
}

async function subirPDF(token, folderId, fileName, pdfBase64) {
  const pdfBuffer = Buffer.from(pdfBase64, 'base64')

  const boundary = 'msh_drive_boundary'
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
  })

  const preamble = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
  const epilogue = `\r\n--${boundary}--`

  const body = Buffer.concat([
    Buffer.from(preamble),
    pdfBuffer,
    Buffer.from(epilogue),
  ])

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  const text = await res.text()
  if (res.status !== 200) {
    console.error('[drive] Upload error status:', res.status, 'body:', text.substring(0, 500))
  }
  try {
    const data = JSON.parse(text)
    return data.id ? data : null
  } catch {
    return null
  }
}

// ── Función principal ─────────────────────────────────────
/**
 * Sube un PDF de minuta a Drive.
 * Estructura: MINUTAS DE OBRA / {proyecto} / Minuta_01_2026-07-08.pdf
 */
export async function subirMinutaADrive(proyecto, pdfBase64, fecha) {
  try {
    const parentFolder = process.env.GOOGLE_DRIVE_MINUTAS_FOLDER
    if (!parentFolder) return { ok: false, error: 'GOOGLE_DRIVE_MINUTAS_FOLDER no configurada' }

    const token = await getAccessToken()
    if (!token) return { ok: false, error: 'No se pudo autenticar con Google Drive' }

    const carpetaNombre = (proyecto || 'Sin proyecto').replace(/[<>:"/\\|?*]/g, '-').trim()

    let carpeta = await buscarCarpeta(token, parentFolder, carpetaNombre)
    if (!carpeta) {
      carpeta = await crearCarpeta(token, parentFolder, carpetaNombre)
      if (!carpeta) return { ok: false, error: 'No se pudo crear la carpeta del proyecto en Drive' }
    }
    const folderId = carpeta.id

    const count = await contarMinutas(token, folderId)
    const numero = String(count + 1).padStart(2, '0')

    const fechaSlug = (fecha || new Date().toISOString().split('T')[0])
      .replace(/\//g, '-')
      .replace(/(\d{2})-(\d{2})-(\d{4})/, '$3-$2-$1')

    const fileName = `Minuta_${numero}_${fechaSlug}.pdf`

    const file = await subirPDF(token, folderId, fileName, pdfBase64)
    if (!file) return { ok: false, error: 'No se pudo subir el PDF a Drive' }

    return {
      ok: true,
      fileName,
      fileId: file.id,
      folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
    }
  } catch (err) {
    console.error('[drive] Error subiendo minuta:', err)
    return { ok: false, error: err.message }
  }
}
