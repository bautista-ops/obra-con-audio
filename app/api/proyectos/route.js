export const maxDuration = 30

export async function GET() {
  try {
    const url = process.env.ODOO_URL
    const user = process.env.ODOO_USER
    const apiKey = process.env.ODOO_API_KEY
    const db = 'grupomsh-main-16859458'

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
    const uidMatch = uidText.match(/<value><int>(\d+)<\/int><\/value>/)
    const uid = uidMatch ? parseInt(uidMatch[1]) : null

    if (!uid) {
      return Response.json({ error: 'Auth fallida' }, { status: 401 })
    }

    // First get stage IDs for "Won" and "En cotización"
    const stageRes = await fetch(`${url}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${db}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>crm.stage</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param><value><array><data>
      <value><array><data></data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member>
        <n>fields</n>
        <value><array><data>
          <value><string>id</string></value>
          <value><string>name</string></value>
        </data></array></value>
      </member>
    </struct></value></param>
  </params>
</methodCall>`
    })

    const stageText = await stageRes.text()
    console.log('Stages:', stageText.substring(0, 500))

    // Extract stage IDs where name contains "Won", "cotiz", "ganado" (case insensitive)
    const stageIds = []
    const stageRegex = /<struct>([\s\S]*?)<\/struct>/g
    let sm
    while ((sm = stageRegex.exec(stageText)) !== null) {
      const s = sm[1]
      const idM = s.match(/<n>id<\/name>[\s\S]*?<int>(\d+)<\/int>/)
      const nameM = s.match(/<n>name<\/name>[\s\S]*?<string>([^<]*)<\/string>/)
      if (idM && nameM) {
        const name = nameM[1].toLowerCase()
        if (name.includes('won') || name.includes('ganado') || name.includes('cotiz')) {
          stageIds.push(parseInt(idM[1]))
          console.log(`Stage incluida: ${nameM[1]} (id: ${idM[1]})`)
        }
      }
    }

    console.log(`Stage IDs filtradas: ${stageIds.join(', ')}`)

    // Build stage filter XML
    const stageFilterXml = stageIds.length > 0
      ? `<value><array><data>
          <value><string>stage_id</string></value>
          <value><string>in</string></value>
          <value><array><data>
            ${stageIds.map(id => `<value><int>${id}</int></value>`).join('\n            ')}
          </data></array></value>
        </data></array></value>`
      : ''

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
      <value><array><data>
        ${stageFilterXml}
      </data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member>
        <n>fields</n>
        <value><array><data>
          <value><string>id</string></value>
          <value><string>name</string></value>
          <value><string>partner_id</string></value>
          <value><string>user_id</string></value>
          <value><string>stage_id</string></value>
        </data></array></value>
      </member>
      <member>
        <n>limit</n>
        <value><int>200</int></value>
      </member>
    </struct></value></param>
  </params>
</methodCall>`
    })

    const searchText = await searchRes.text()

    const records = []
    const structRegex = /<struct>([\s\S]*?)<\/struct>/g
    let match

    while ((match = structRegex.exec(searchText)) !== null) {
      const struct = match[1]

      const getField = (fieldName, type = 'string') => {
        const re = new RegExp(
          `<n>${fieldName}<\\/name>[\\s\\S]*?<value>${
            type === 'int' ? '<int>(\\d+)<\\/int>' : '<string>([^<]*)<\\/string>'
          }<\\/value>`
        )
        const m = struct.match(re)
        return m ? (type === 'int' ? parseInt(m[1]) : m[1]) : null
      }

      const getM2O = (fieldName) => {
        const re = new RegExp(
          `<n>${fieldName}<\\/name>[\\s\\S]*?<array><data>[\\s\\S]*?<string>([^<]*)<\\/string>`
        )
        const m = struct.match(re)
        return m ? m[1] : null
      }

      const id = getField('id', 'int')
      const nombre = getField('name')

      if (id && nombre) {
        records.push({
          id,
          nombre,
          cliente: getM2O('partner_id'),
          comercial: getM2O('user_id'),
          etapa: getM2O('stage_id'),
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
