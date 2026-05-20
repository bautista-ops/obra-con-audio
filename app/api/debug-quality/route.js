export const maxDuration = 30

const DB = 'grupomsh-main-16859458'

export async function GET() {
  try {
    const url = process.env.ODOO_URL
    const user = process.env.ODOO_USER
    const apiKey = process.env.ODOO_API_KEY

    const uidRes = await fetch(`${url}/xmlrpc/2/common`, {
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
    const uidText = await uidRes.text()
    const uid = parseInt(uidText.match(/<int>(\d+)<\/int>/)?.[1])

    // Leer campos disponibles de quality.alert
    const fieldsRes = await fetch(`${url}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${DB}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>quality.alert</string></value></param>
    <param><value><string>fields_get</string></value></param>
    <param><value><array><data></data></array></value></param>
    <param><value><struct>
      <member><name>attributes</name>
        <value><array><data>
          <value><string>string</string></value>
          <value><string>type</string></value>
        </data></array></value>
      </member>
    </struct></value></param>
  </params>
</methodCall>`
    })

    const xml = await fieldsRes.text()
    // Extraer nombres y tipos de campos
    const campos = []
    const memberRe = /<member>([\s\S]*?)<\/member>/g
    const blocks = xml.match(/<value>\s*<struct>([\s\S]*?)<\/struct>\s*<\/value>/g) || []

    // Parsear más simple — buscar pares name/string
    const fieldRe = /<name>([^<]+)<\/name>\s*<value>\s*<struct>([\s\S]*?)<\/struct>/g
    let m
    while ((m = fieldRe.exec(xml)) !== null) {
      const fieldName = m[1]
      const strM = m[2].match(/<name>string<\/name>\s*<value><string>([^<]+)<\/string>/)
      const typeM = m[2].match(/<name>type<\/name>\s*<value><string>([^<]+)<\/string>/)
      if (strM && typeM) {
        campos.push({ campo: fieldName, label: strM[1], tipo: typeM[1] })
      }
    }

    return Response.json({ campos: campos.slice(0, 60) })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST() {
  // Ver opciones de quality.reason
  try {
    const url = process.env.ODOO_URL
    const user = process.env.ODOO_USER
    const apiKey = process.env.ODOO_API_KEY

    const uidRes = await fetch(`${url}/xmlrpc/2/common`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>grupomsh-main-16859458</string></value></param>
    <param><value><string>${user}</string></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`
    })
    const uid = parseInt((await uidRes.text()).match(/<int>(\d+)<\/int>/)?.[1])

    const res = await fetch(`${url}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>grupomsh-main-16859458</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>quality.reason</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param><value><array><data><value><array><data></data></array></value></data></array></value></param>
    <param><value><struct>
      <member><name>fields</name><value><array><data>
        <value><string>id</string></value>
        <value><string>name</string></value>
      </data></array></value></member>
      <member><name>limit</name><value><int>50</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`
    })
    const xml = await res.text()
    const razones = []
    const blocks = xml.match(/<struct>[\s\S]*?<\/struct>/g) || []
    for (const b of blocks) {
      const idM = b.match(/<name>id<\/name>\s*<value><int>(\d+)<\/int>/)
      const nameM = b.match(/<name>name<\/name>\s*<value><string>([^<]+)<\/string>/)
      if (idM && nameM) razones.push({ id: parseInt(idM[1]), nombre: nameM[1] })
    }
    return Response.json({ razones })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
