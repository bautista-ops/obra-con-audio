/**
 * drive.js — Google Drive upload via Service Account
 * Sin dependencias externas: usa crypto nativo de Node.js para firmar el JWT.
 */

import crypto from 'crypto'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

// ── Auth ──────────────────────────────────────────────────
function createJWT(email, privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const claims = Buffer.from(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')

  const signInput = `${header}.${claims}`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signInput)
  const signature = sign.sign(privateKey, 'base64url')
  return `${signInput}.${signature}`
}

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!email || !rawKey) return null

  // Vercel a veces escapa los \n de la private key — restaurarlos
  const privateKey = rawKey.replace(/\\n/g, '\n')

  const jwt = createJWT(email, privateKey)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
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

  // Multipart upload: metadata + contenido binario en un solo request
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
  const data = await res.json()
  return data.id ? data : null
}

// ── Función principal ─────────────────────────────────────
/**
 * Sube un PDF de minuta a Drive.
 * Estructura: MINUTAS DE OBRA / {proyecto} / Minuta_01_2026-07-08.pdf
 *
 * @param {string} proyecto - Nombre del proyecto (ej: "P-06663 6430 - Edificio Aurora")
 * @param {string} pdfBase64 - PDF en base64
 * @param {string} fecha - Fecha de la minuta (ej: "08/07/2026")
 * @returns {{ ok, fileName, fileId, folderUrl, error }}
 */
export async function subirMinutaADrive(proyecto, pdfBase64, fecha) {
  try {
    const parentFolder = process.env.GOOGLE_DRIVE_MINUTAS_FOLDER
    if (!parentFolder) return { ok: false, error: 'GOOGLE_DRIVE_MINUTAS_FOLDER no configurada' }

    const token = await getAccessToken()
    if (!token) return { ok: false, error: 'No se pudo autenticar con Google Drive' }

    // Nombre de la carpeta del proyecto — limpiar caracteres problemáticos
    const carpetaNombre = (proyecto || 'Sin proyecto').replace(/[<>:"/\\|?*]/g, '-').trim()

    // Buscar o crear subcarpeta del proyecto
    let carpeta = await buscarCarpeta(token, parentFolder, carpetaNombre)
    if (!carpeta) {
      carpeta = await crearCarpeta(token, parentFolder, carpetaNombre)
      if (!carpeta) return { ok: false, error: 'No se pudo crear la carpeta del proyecto en Drive' }
    }
    const folderId = carpeta.id

    // Contar minutas existentes → número correlativo
    const count = await contarMinutas(token, folderId)
    const numero = String(count + 1).padStart(2, '0')

    // Formatear fecha para el nombre del archivo
    const fechaSlug = (fecha || new Date().toISOString().split('T')[0])
      .replace(/\//g, '-')
      .replace(/(\d{2})-(\d{2})-(\d{4})/, '$3-$2-$1') // DD/MM/YYYY → YYYY-MM-DD

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
