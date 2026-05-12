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
  const match = text.match(/<int>(\d+)<\/int>/)
  return match ? parseInt(match[1]) : null
}

export async function POST(request) {
  try {
    const { proyecto_id, tipo, fecha, obra, pdf_base64, pdf_nombre } = await request.json()

    if (!proyecto_id || !pdf_base64) {
      return Response.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    const url = process.env.ODOO_URL
    const apiKey = process.env.ODOO_API_KEY

    const uid = await odooAuth()
    if (!uid) return Response.json({ error: 'Auth ODOO fallida' }, { status: 401 })

    // 1. Crear adjunto (ir.attachment) con el PDF
    const adjuntoRes = await fetch(`${url}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${DB}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>ir.attachment</string></value></param>
    <param><value><string>create</string></value></param>
    <param><value><array><data>
      <value><struct>
        <member><name>name</name><value><string>${pdf_nombre}</string></value></member>
        <member><name>type</name><value><string>binary</string></value></member>
        <member><name>datas</name><value><string>${pdf_base64}</string></value></member>
        <member><name>mimetype</name><value><string>application/pdf</string></value></member>
        <member><name>res_model</name><value><string>crm.lead</string></value></member>
        <member><name>res_id</name><value><int>${proyecto_id}</int></value></member>
      </struct>
    </value></data></array></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`
    })

    const adjuntoXml = await adjuntoRes.text()
    const adjuntoIdM = adjuntoXml.match(/<int>(\d+)<\/int>/)
    const adjuntoId = adjuntoIdM ? parseInt(adjuntoIdM[1]) : null

    if (!adjuntoId) {
      return Response.json({ error: 'No se pudo crear el adjunto en ODOO' }, { status: 500 })
    }

    // 2. Postear nota en el chatter con el adjunto vinculado
    const tipoLabel = tipo === 'minuta' ? '📋 Minuta de reunión' : '⚠️ No Conformidad'
    const cuerpoNota = `${tipoLabel} — ${fecha || new Date().toLocaleDateString('es-AR')}&lt;br/&gt;Obra: ${obra || 'Sin especificar'}&lt;br/&gt;&lt;br/&gt;Registrada desde MSH Asistente de Obra. Ver PDF adjunto.`

    const notaRes = await fetch(`${url}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${DB}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>crm.lead</string></value></param>
    <param><value><string>message_post</string></value></param>
    <param><value><array><data>
      <value><int>${proyecto_id}</int></value>
    </data></array></value></param>
    <param><value><struct>
      <member><name>body</name><value><string>${cuerpoNota}</string></value></member>
      <member><name>message_type</name><value><string>comment</string></value></member>
      <member><name>subtype_xmlid</name><value><string>mail.mt_note</string></value></member>
      <member><name>attachment_ids</name>
        <value><array><data>
          <value><array><data>
            <value><int>4</int></value>
            <value><int>0</int></value>
            <value><int>${adjuntoId}</int></value>
          </data></array></value>
        </data></array></value>
      </member>
    </struct></value></param>
  </params>
</methodCall>`
    })

    const notaXml = await notaRes.text()
    const msgIdM = notaXml.match(/<int>(\d+)<\/int>/)

    return Response.json({
      ok: true,
      adjunto_id: adjuntoId,
      msg_id: msgIdM ? parseInt(msgIdM[1]) : null,
    })

  } catch (error) {
    console.error('Error guardar-odoo:', error)
    return Response.json({ error: error?.message }, { status: 500 })
  }
}
