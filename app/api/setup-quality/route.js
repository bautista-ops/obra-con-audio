export const maxDuration = 30

const DB = 'grupomsh-main-16859458'

async function odooAuth() {
  const url = process.env.ODOO_URL
  const user = process.env.ODOO_USER
  const apiKey = process.env.ODOO_API_KEY
  const res = await fetch(`${url}/xmlrpc/2/common`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${DB}</string></value></param>
    <param><value><string>${user}</string></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`
  })
  const text = await res.text()
  return parseInt(text.match(/<int>(\d+)<\/int>/)?.[1])
}

async function crearRazon(url, apiKey, uid, nombre) {
  const res = await fetch(`${url}/xmlrpc/2/object`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${DB}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>quality.reason</string></value></param>
    <param><value><string>create</string></value></param>
    <param><value><array><data>
      <value><struct>
        <member><name>name</name><value><string>${nombre}</string></value></member>
      </struct>
    </value></data></array></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`
  })
  const xml = await res.text()
  const m = xml.match(/<int>(\d+)<\/int>/)
  return m ? parseInt(m[1]) : null
}

export async function POST() {
  try {
    const url = process.env.ODOO_URL
    const apiKey = process.env.ODOO_API_KEY
    const uid = await odooAuth()

    const nuevas = [
      'Compras',
      'Oficina Técnica',
    ]

    const creadas = []
    for (const nombre of nuevas) {
      const id = await crearRazon(url, apiKey, uid, nombre)
      creadas.push({ id, nombre })
    }

    return Response.json({ ok: true, creadas })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
