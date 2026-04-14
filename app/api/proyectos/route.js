export const maxDuration = 30

export async function GET() {
  try {
    const url = process.env.ODOO_URL
    const user = process.env.ODOO_USER
    const apiKey = process.env.ODOO_API_KEY

    // Step 1: get uid via xmlrpc common endpoint
    const uidRes = await fetch(`${url}/xmlrpc/2/common`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>grupomsh</string></value></param>
    <param><value><string>${user}</string></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`
    })

    const uidText = await uidRes.text()
    console.log('Auth response:', uidText.substring(0, 200))

    const uidMatch = uidText.match(/<value><int>(\d+)<\/int><\/value>/)
    const uid = uidMatch ? parseInt(uidMatch[1]) : null

    if (!uid) {
      console.error('No se obtuvo UID de Odoo. Respuesta:', uidText.substring(0, 300))
      return Response.json({ error: 'No se pudo autenticar con Odoo' }, { status: 401 })
    }

    console.log(`Odoo auth OK, uid: ${uid}`)

    // Step 2: search CRM leads
    const searchRes = await fetch(`${url}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>grupomsh</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>crm.lead</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param><value><array><data>
      <value><array><data></data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member>
        <name>fields</name>
        <value><array><data>
          <value><string>id</string></value>
          <value><string>name</string></value>
          <value><string>partner_id</string></value>
          <value><string>user_id</string></value>
          <value><string>stage_id</string></value>
        </data></array></value>
      </member>
      <member>
        <name>limit</name>
        <value><int>200</int></value>
      </member>
    </struct></value></param>
  </params>
</methodCall>`
    })

    const searchText = await searchRes.text()
    console.log('Search response preview:', searchText.substring(0, 300))

    // Parse XML response into JSON
    const records = []
    const memberRegex = /<struct>([\s\S]*?)<\/struct>/g
    let structMatch
    while ((structMatch = memberRegex.exec(searchText)) !== null) {
      const struct = structMatch[1]
      const getId = struct.match(/<name>id<\/name>\s*<value><int>(\d+)<\/int><\/value>/)
      const getName = struct.match(/<name>name<\/name>\s*<value><string>(.*?)<\/string><\/value>/)
      const getUser = struct.match(/<name>user_id<\/name>[\s\S]*?<string>(.*?)<\/string>/)
      const getStage = struct.match(/<name>stage_id<\/name>[\s\S]*?<string>(.*?)<\/string>/)
      const getPartner = struct.match(/<name>partner_id<\/name>[\s\S]*?<string>(.*?)<\/string>/)

      if (getId && getName) {
        records.push({
          id: parseInt(getId[1]),
          nombre: getName[1],
          cliente: getPartner ? getPartner[1] : null,
          comercial: getUser ? getUser[1] : null,
          etapa: getStage ? getStage[1] : null,
        })
      }
    }

    console.log(`Proyectos obtenidos: ${records.length}`)
    return Response.json({ proyectos: records })

  } catch (error) {
    console.error('Error proyectos:', error?.message || error)
    return Response.json({ error: 'Error al conectar con Odoo' }, { status: 500 })
  }
}
