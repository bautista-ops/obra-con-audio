export const maxDuration = 30

function extractValue(xml, fieldName) {
  const re = new RegExp(
    `<name>${fieldName}<\\/name>\\s*<value>([\\s\\S]*?)<\\/value>\\s*<\\/member>`,
    'i'
  )
  const m = xml.match(re)
  if (!m) return null
  const val = m[1]
  const intM = val.match(/<int>(\d+)<\/int>/)
  if (intM) return parseInt(intM[1])
  const strM = val.match(/<string>([^<]*)<\/string>/)
  if (strM) return strM[1]
  const boolM = val.match(/<boolean>(\d)<\/boolean>/)
  if (boolM) return boolM[1] === '1'
  // array (many2one) — return second string element
  const arrStrings = val.match(/<string>([^<]*)<\/string>/g)
  if (arrStrings && arrStrings.length >= 1) {
    return arrStrings[arrStrings.length - 1].replace(/<\/?string>/g, '')
  }
  return null
}

function extractIntFromArray(xml, fieldName) {
  const re = new RegExp(
    `<name>${fieldName}<\\/name>\\s*<value>[\\s\\S]*?<int>(\\d+)<\\/int>`,
    'i'
  )
  const m = xml.match(re)
  return m ? parseInt(m[1]) : null
}

export async function GET() {
  try {
    const url = process.env.ODOO_URL
    const user = process.env.ODOO_USER
    const apiKey = process.env.ODOO_API_KEY
    const db = 'grupomsh-main-16859458'

    // Authenticate via XML-RPC (supports API keys)
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

    if (!uid) {
      return Response.json({ error: 'Auth fallida' }, { status: 401 })
    }

    console.log(`Auth OK, uid: ${uid}`)

    // Search CRM leads
    const searchRes = await fetch(`${url}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${db}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>crm.lead</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param><value><array><data>
      <value><array><data></data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member><name>fields</name>
        <value><array><data>
          <value><string>id</string></value>
          <value><string>name</string></value>
          <value><string>partner_id</string></value>
          <value><string>user_id</string></value>
          <value><string>stage_id</string></value>
        </data></array></value>
      </member>
      <member><name>limit</name>
        <value><int>200</int></value>
      </member>
    </struct></value></param>
  </params>
</methodCall>`
    })

    const searchText = await searchRes.text()
    console.log('Raw XML sample:', searchText.substring(0, 400))

    // Split by record — each record is wrapped in <value><struct>...</struct></value>
    const recordMatches = searchText.match(/<value>\s*<struct>([\s\S]*?)<\/struct>\s*<\/value>/g) || []
    console.log(`Record blocks found: ${recordMatches.length}`)

    const records = []

    for (const block of recordMatches) {
      // Extract id
      const idM = block.match(/<name>id<\/name>\s*<value>\s*<int>(\d+)<\/int>/)
      // Extract name
      const nameM = block.match(/<name>name<\/name>\s*<value>\s*<string>([^<]*)<\/string>/)
      // Extract comercial (user_id) — second string in array
      const userM = block.match(/<name>user_id<\/name>[\s\S]*?<string>([^<]+)<\/string>/)
      // Extract cliente (partner_id) — second string in array
      const partnerM = block.match(/<name>partner_id<\/name>[\s\S]*?<string>([^<]+)<\/string>/)
      // Extract stage
      const stageM = block.match(/<name>stage_id<\/name>[\s\S]*?<string>([^<]+)<\/string>/)

      if (idM && nameM) {
        const etapa = stageM ? stageM[1] : ''
        const etapaLower = etapa.toLowerCase()
        // Only include won/ganado/cotiz stages
        if (etapaLower.includes('won') || etapaLower.includes('ganado') || etapaLower.includes('cotiz')) {
          records.push({
            id: parseInt(idM[1]),
            nombre: nameM[1],
            cliente: partnerM ? partnerM[1] : null,
            comercial: userM ? userM[1] : null,
            etapa,
          })
        }
      }
    }

    console.log(`Proyectos filtrados: ${records.length}`)
    return Response.json({ proyectos: records })

  } catch (error) {
    console.error('Error:', error?.message || error)
    return Response.json({ error: 'Error al conectar con Odoo' }, { status: 500 })
  }
}
