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

    // Función auxiliar para llamar ODOO
    const odooCall = async (model, fields, limit = 500, domain = '') => {
      const res = await fetch(`${url}/xmlrpc/2/object`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${db}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>${model}</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param><value><array><data>
      <value><array><data>${domain}</data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member><name>fields</name>
        <value><array><data>
          ${fields.map(f => `<value><string>${f}</string></value>`).join('\n          ')}
        </data></array></value>
      </member>
      <member><name>limit</name><value><int>${limit}</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`
      })
      return res.text()
    }

    // Buscar CRM leads y project.project en paralelo
    const [crmXml, projXml] = await Promise.all([
      odooCall('crm.lead', ['id', 'name', 'partner_id', 'user_id', 'stage_id']),
      odooCall('project.project', ['id', 'name', 'user_id'], 500,
        `<value><array><data>
          <value><string>active</string></value>
          <value><string>=</string></value>
          <value><boolean>1</boolean></value>
        </data></array></value>`)
    ])

    // Parsear CRM
    const crmBlocks = crmXml.match(/<value>\s*<struct>([\s\S]*?)<\/struct>\s*<\/value>/g) || []
    console.log(`CRM blocks: ${crmBlocks.length}`)

    const records = []

    for (const block of crmBlocks) {
      const idM = block.match(/<name>id<\/name>\s*<value>\s*<int>(\d+)<\/int>/)
      const nameM = block.match(/<name>name<\/name>\s*<value>\s*<string>([^<]*)<\/string>/)
      const userM = block.match(/<name>user_id<\/name>[\s\S]*?<string>([^<]+)<\/string>/)
      const partnerM = block.match(/<name>partner_id<\/name>[\s\S]*?<string>([^<]+)<\/string>/)
      const stageM = block.match(/<name>stage_id<\/name>[\s\S]*?<string>([^<]+)<\/string>/)

      if (idM && nameM) {
        const etapa = stageM ? stageM[1] : ''
        const etapaLower = etapa.toLowerCase()
        if (etapaLower.includes('won') || etapaLower.includes('ganado') || etapaLower.includes('cotiz')) {
          records.push({
            id: parseInt(idM[1]),
            nombre: nameM[1],
            cliente: partnerM ? partnerM[1] : null,
            comercial: userM ? userM[1] : null,
            etapa,
            origen: 'crm',
          })
        }
      }
    }

    // Parsear project.project
    const projBlocks = projXml.match(/<value>\s*<struct>([\s\S]*?)<\/struct>\s*<\/value>/g) || []
    console.log(`Project blocks: ${projBlocks.length}`)

    const crmNombres = new Set(records.map(r => r.nombre.toLowerCase().trim()))

    for (const block of projBlocks) {
      const idM = block.match(/<name>id<\/name>\s*<value>\s*<int>(\d+)<\/int>/)
      const nameM = block.match(/<name>name<\/name>\s*<value>\s*<string>([^<]*)<\/string>/)
      const userM = block.match(/<name>user_id<\/name>[\s\S]*?<string>([^<]+)<\/string>/)

      if (idM && nameM) {
        const nombre = nameM[1].trim()
        // No duplicar si ya viene del CRM con mismo nombre
        if (!crmNombres.has(nombre.toLowerCase())) {
          records.push({
            id: parseInt(idM[1]),
            nombre,
            cliente: null,
            comercial: userM ? userM[1] : null,
            etapa: 'Proyecto',
            origen: 'project',
          })
        }
      }
    }

    // Ordenar: CRM primero, luego proyectos, ambos alfabéticos
    records.sort((a, b) => {
      if (a.origen !== b.origen) return a.origen === 'crm' ? -1 : 1
      return a.nombre.localeCompare(b.nombre)
    })

    console.log(`Total proyectos: ${records.length}`)
    return Response.json({ proyectos: records })

  } catch (error) {
    console.error('Error:', error?.message || error)
    return Response.json({ error: 'Error al conectar con Odoo' }, { status: 500 })
  }
}
