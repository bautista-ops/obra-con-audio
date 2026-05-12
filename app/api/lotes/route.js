export const maxDuration = 30

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const proyecto = searchParams.get('proyecto') // número de proyecto ej: 6155

    if (!proyecto) {
      return Response.json({ error: 'Falta proyecto' }, { status: 400 })
    }

    const url = process.env.ODOO_URL
    const user = process.env.ODOO_USER
    const apiKey = process.env.ODOO_API_KEY
    const db = 'grupomsh-main-16859458'

    // Autenticar
    const uidRes = await fetch(`${url}/xmlrpc/2/common`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${db}</string></value></param>
    <param><value><string>${user}</string></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`
    })
    const uidText = await uidRes.text()
    const uidMatch = uidText.match(/<int>(\d+)<\/int>/)
    const uid = uidMatch ? parseInt(uidMatch[1]) : null
    if (!uid) return Response.json({ error: 'Auth fallida' }, { status: 401 })

    // Buscar lotes que contengan el número de proyecto en el nombre
    const lotesRes = await fetch(`${url}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${db}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>stock.lot</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param><value><array><data>
      <value><array><data>
        <value><array><data>
          <value><string>name</string></value>
          <value><string>ilike</string></value>
          <value><string>${proyecto}</string></value>
        </data></array></value>
      </data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member><name>fields</name>
        <value><array><data>
          <value><string>id</string></value>
          <value><string>name</string></value>
          <value><string>product_id</string></value>
          <value><string>ref</string></value>
        </data></array></value>
      </member>
      <member><name>limit</name><value><int>50</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`
    })

    const lotesXml = await lotesRes.text()

    // Parsear lotes
    const lotes = []
    const blocks = lotesXml.match(/<struct>[\s\S]*?<\/struct>/g) || []
    for (const block of blocks) {
      const idM = block.match(/<name>id<\/name>\s*<value><int>(\d+)<\/int>/)
      const nameM = block.match(/<name>name<\/name>\s*<value><string>([^<]+)<\/string>/)
      const productM = block.match(/<name>product_id<\/name>[\s\S]*?<string>([^<]+)<\/string>/)
      const refM = block.match(/<name>ref<\/name>\s*<value><string>([^<]*)<\/string>/)
      if (idM && nameM) {
        lotes.push({
          id: parseInt(idM[1]),
          nombre: nameM[1].trim(),
          producto: productM ? productM[1].trim() : '',
          ref: refM ? refM[1].trim() : '',
        })
      }
    }

    return Response.json({ lotes, total: lotes.length })

  } catch (error) {
    return Response.json({ error: error?.message }, { status: 500 })
  }
}
