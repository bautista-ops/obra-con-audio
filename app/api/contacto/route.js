export const maxDuration = 30

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const proyectoId = searchParams.get('proyecto_id')

    if (!proyectoId) {
      return Response.json({ error: 'Falta proyecto_id' }, { status: 400 })
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

    // Traer datos del lead incluyendo email y partner_id
    const leadRes = await fetch(`${url}/xmlrpc/2/object`, {
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
        <value><array><data>
          <value><string>id</string></value>
          <value><string>=</string></value>
          <value><int>${proyectoId}</int></value>
        </data></array></value>
      </data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member><name>fields</name>
        <value><array><data>
          <value><string>id</string></value>
          <value><string>name</string></value>
          <value><string>partner_id</string></value>
          <value><string>email_from</string></value>
          <value><string>contact_name</string></value>
        </data></array></value>
      </member>
      <member><name>limit</name><value><int>1</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`
    })

    const leadXml = await leadRes.text()

    // Extraer email principal y nombre de contacto del lead
    const emailM = leadXml.match(/<name>email_from<\/name>\s*<value><string>([^<]*)<\/string>/)
    const contactM = leadXml.match(/<name>contact_name<\/name>\s*<value><string>([^<]*)<\/string>/)
    const partnerNameM = leadXml.match(/<name>partner_id<\/name>[\s\S]*?<string>([^<]+)<\/string>/)
    const partnerIdM = leadXml.match(/<name>partner_id<\/name>\s*<value><array><data>\s*<value><int>(\d+)<\/int>/)

    let contactosAdicionales = []

    // Si hay partner_id, buscar contactos de esa empresa
    if (partnerIdM) {
      const partnerId = parseInt(partnerIdM[1])

      const partnerRes = await fetch(`${url}/xmlrpc/2/object`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${db}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>res.partner</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param><value><array><data>
      <value><array><data>
        <value><array><data>
          <value><string>parent_id</string></value>
          <value><string>=</string></value>
          <value><int>${partnerId}</int></value>
        </data></array></value>
      </data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member><name>fields</name>
        <value><array><data>
          <value><string>id</string></value>
          <value><string>name</string></value>
          <value><string>email</string></value>
          <value><string>function</string></value>
        </data></array></value>
      </member>
      <member><name>limit</name><value><int>20</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`
      })

      const partnerXml = await partnerRes.text()
      const blocks = partnerXml.match(/<struct>[\s\S]*?<\/struct>/g) || []

      for (const block of blocks) {
        const nM = block.match(/<name>name<\/name>\s*<value><string>([^<]+)<\/string>/)
        const eM = block.match(/<name>email<\/name>\s*<value><string>([^<]+)<\/string>/)
        const fM = block.match(/<name>function<\/name>\s*<value><string>([^<]*)<\/string>/)
        if (nM && eM) {
          contactosAdicionales.push({
            nombre: nM[1].trim(),
            email: eM[1].trim(),
            funcion: fM ? fM[1].trim() : '',
          })
        }
      }
    }

    return Response.json({
      email_principal: emailM ? emailM[1] : '',
      contacto_nombre: contactM ? contactM[1] : (partnerNameM ? partnerNameM[1] : ''),
      contactos: contactosAdicionales,
    })

  } catch (error) {
    return Response.json({ error: error?.message }, { status: 500 })
  }
}
