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
    const uidMatch = uidText.match(/<int>(\d+)<\/int>/)
    const uid = uidMatch ? parseInt(uidMatch[1]) : null

    if (!uid) return Response.json({ error: 'Auth fallida' }, { status: 401 })

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
    <param><value><string>hr.employee</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param><value><array><data>
      <value><array><data>
        <value><array><data>
          <value><string>active</string></value>
          <value><string>=</string></value>
          <value><boolean>1</boolean></value>
        </data></array></value>
      </data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member><n>fields</n>
        <value><array><data>
          <value><string>id</string></value>
          <value><string>name</string></value>
          <value><string>job_title</string></value>
        </data></array></value>
      </member>
      <member><n>limit</n>
        <value><int>100</int></value>
      </member>
      <member><n>order</n>
        <value><string>name asc</string></value>
      </member>
    </struct></value></param>
  </params>
</methodCall>`
    })

    const searchText = await searchRes.text()
    const records = []
    const structRegex = /<value>\s*<struct>([\s\S]*?)<\/struct>\s*<\/value>/g
    let match

    while ((match = structRegex.exec(searchText)) !== null) {
      const block = match[1]
      const idM = block.match(/<n>id<\/name>\s*<value>\s*<int>(\d+)<\/int>/)
      const nameM = block.match(/<n>name<\/name>\s*<value>\s*<string>([^<]+)<\/string>/)
      const jobM = block.match(/<n>job_title<\/name>\s*<value>\s*<string>([^<]*)<\/string>/)

      if (idM && nameM) {
        records.push({
          id: parseInt(idM[1]),
          nombre: nameM[1].trim(),
          cargo: jobM ? jobM[1].trim() : null
        })
      }
    }

    console.log(`Empleados obtenidos: ${records.length}`)
    return Response.json({ empleados: records })

  } catch (error) {
    console.error('Error empleados:', error?.message)
    return Response.json({ error: 'Error al conectar con Odoo' }, { status: 500 })
  }
}
