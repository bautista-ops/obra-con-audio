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

export async function POST() {
  try {
    const url = process.env.ODOO_URL
    const apiKey = process.env.ODOO_API_KEY
    const uid = await odooAuth()

    // Borrar duplicados IDs 10-14
    const idsABorrar = [10, 11, 12, 13, 14]
    const idsXml = idsABorrar.map(id => `<value><int>${id}</int></value>`).join('')

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
    <param><value><string>unlink</string></value></param>
    <param><value><array><data>
      <value><array><data>${idsXml}</data></array></value>
    </data></array></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`
    })

    const xml = await res.text()
    const ok = xml.includes('<boolean>1</boolean>')
    return Response.json({ ok, borrados: idsABorrar })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
