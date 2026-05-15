export const maxDuration = 60

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
  const match = text.match(/<int>(\d+)<\/int>/)
  return match ? parseInt(match[1]) : null
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const uid = await odooAuth()
    if (!uid) return Response.json({ error: 'Auth ODOO fallida' }, { status: 500 })

    // Traer proyectos cotizados y ganados del CRM
    const res = await fetch(`${process.env.ODOO_URL}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${DB}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${process.env.ODOO_API_KEY}</string></value></param>
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
          <value><string>stage_id</string></value>
          <value><string>user_id</string></value>
          <value><string>partner_id</string></value>
        </data></array></value>
      </member>
      <member><name>limit</name><value><int>500</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`
    })

    const xml = await res.text()

    // Parsear proyectos
    const proyectos = []
    const blocks = xml.match(/<value>\s*<struct>([\s\S]*?)<\/struct>\s*<\/value>/g) || []

    for (const block of blocks) {
      const idM = block.match(/<name>id<\/name>\s*<value><int>(\d+)<\/int>/)
      const nameM = block.match(/<name>name<\/name>\s*<value><string>([^<]+)<\/string>/)
      const stageM = block.match(/<name>stage_id<\/name>[\s\S]*?<string>([^<]+)<\/string>/)
      const userM = block.match(/<name>user_id<\/name>[\s\S]*?<string>([^<]+)<\/string>/)
      const partnerM = block.match(/<name>partner_id<\/name>[\s\S]*?<string>([^<]+)<\/string>/)

      if (!idM || !nameM) continue

      const etapa = (stageM ? stageM[1] : '').toLowerCase()
      if (!etapa.includes('won') && !etapa.includes('ganado') &&
          !etapa.includes('cotiz') && !etapa.includes('cotizado')) continue

      proyectos.push({
        id: parseInt(idM[1]),
        nombre: nameM[1].trim(),
        etapa: stageM ? stageM[1] : '',
        comercial: userM ? userM[1] : '',
        cliente: partnerM ? partnerM[1] : '',
      })
    }

    // Generar texto del system prompt para obras
    const listaObras = proyectos
      .map(p => `- [ID:${p.id}] ${p.nombre} | ${p.etapa} | Comercial: ${p.comercial}`)
      .join('\n')

    console.log(`[CRON] Update exitoso — ${proyectos.length} proyectos activos desde ODOO`)

    return Response.json({
      ok: true,
      proyectos_encontrados: proyectos.length,
      muestra: proyectos.slice(0, 5),
      fecha: new Date().toISOString(),
    })

  } catch (error) {
    console.error('[CRON] Error:', error)
    return Response.json({ error: error?.message }, { status: 500 })
  }
}
