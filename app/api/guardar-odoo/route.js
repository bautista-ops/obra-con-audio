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
    const { proyecto_id, tipo, fecha, obra, pdf_base64, pdf_nombre, ncData } = await request.json()

    if (!proyecto_id || !pdf_base64) {
      return Response.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    const url = process.env.ODOO_URL
    const apiKey = process.env.ODOO_API_KEY

    const uid = await odooAuth()
    if (!uid) return Response.json({ error: 'Auth ODOO fallida' }, { status: 401 })

    // 1. Crear adjunto PDF
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

    // 2. Buscar partner_ids de Joaquín y Eric para notificar
    const partnerRes = await fetch(`${url}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${DB}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>res.partner</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param><value><array><data>
      <value><array><data>
        <value><array><data>
          <value><string>email</string></value>
          <value><string>in</string></value>
          <value><array><data>
            <value><string>joaquin@grupomsh.com.ar</string></value>
            <value><string>eric@grupomsh.com.ar</string></value>
          </data></array></value>
        </data></array></value>
      </data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member><name>fields</name>
        <value><array><data>
          <value><string>id</string></value>
          <value><string>email</string></value>
        </data></array></value>
      </member>
      <member><name>limit</name><value><int>5</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`
    })

    const partnerXml = await partnerRes.text()
    const partnerIds = []
    const pidMatches = partnerXml.matchAll(/<name>id<\/name>\s*<value><int>(\d+)<\/int>/g)
    for (const m of pidMatches) partnerIds.push(parseInt(m[1]))

    const partnerIdsXml = partnerIds.map(id =>
      `<value><array><data><value><int>4</int></value><value><int>0</int></value><value><int>${id}</int></value></data></array></value>`
    ).join('')

    // 3. Postear nota con adjunto y notificación
    const tipoLabel = tipo === 'minuta' ? '📋 Minuta de reunión' : '⚠️ No Conformidad'
    const cuerpoNota = `${tipoLabel} — ${fecha || new Date().toLocaleDateString('es-AR')}&lt;br/&gt;Obra: ${obra || 'Sin especificar'}&lt;br/&gt;&lt;br/&gt;Registrada desde MSH Asistente de Obra. Ver PDF adjunto.`

    const partnerMember = partnerIds.length > 0
      ? `<member><name>partner_ids</name><value><array><data>${partnerIdsXml}</data></array></value></member>`
      : ''

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
      ${partnerMember}
    </struct></value></param>
  </params>
</methodCall>`
    })

    const notaXml = await notaRes.text()
    const msgIdM = notaXml.match(/<int>(\d+)<\/int>/)

    // Subir imágenes de piezas como adjuntos adicionales
    let imagenesSubidas = 0
    if (ncData?.items) {
      for (const item of ncData.items) {
        if (!item.imagenes || item.imagenes.length === 0) continue
        for (let idx = 0; idx < item.imagenes.length; idx++) {
          const img = item.imagenes[idx]
          const nombreImg = `NC_${item.lote?.replace(/[^a-z0-9]/gi, '_') || 'pieza'}_foto${idx + 1}.jpg`
          await fetch(`${url}/xmlrpc/2/object`, {
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
        <member><name>name</name><value><string>${nombreImg}</string></value></member>
        <member><name>type</name><value><string>binary</string></value></member>
        <member><name>datas</name><value><string>${img.base64}</string></value></member>
        <member><name>mimetype</name><value><string>image/jpeg</string></value></member>
        <member><name>res_model</name><value><string>crm.lead</string></value></member>
        <member><name>res_id</name><value><int>${proyecto_id}</int></value></member>
      </struct>
    </value></data></array></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`
          })
          imagenesSubidas++
        }
      }
    }

    // Crear alerta de calidad si es una NC
    let alertaId = null
    if (tipo === 'nc' && ncData) {
      // Buscar user_id de Eric Regner (responsable de calidad)
      const ericUserRes = await fetch(`${url}/xmlrpc/2/object`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${DB}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>res.users</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param><value><array><data>
      <value><array><data>
        <value><array><data>
          <value><string>login</string></value>
          <value><string>=</string></value>
          <value><string>eric@grupomsh.com.ar</string></value>
        </data></array></value>
      </data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member><name>fields</name>
        <value><array><data>
          <value><string>id</string></value>
          <value><string>name</string></value>
        </data></array></value>
      </member>
      <member><name>limit</name><value><int>1</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`
      })
      const ericXml = await ericUserRes.text()
      const ericIdM = ericXml.match(/<name>id<\/name>\s*<value><int>(\d+)<\/int>/)
      const ericUserId = ericIdM ? parseInt(ericIdM[1]) : null

      // Mapear prioridad: Alta=2, Media=1, Baja=0
      const prioridadMap = { 'Alta': '2', 'Media': '1', 'Baja': '0' }
      const prioridad = prioridadMap[ncData.gravedad] || '0'

      // Armar descripción completa
      const itemsDesc = (ncData.items || []).map(i =>
        `Pieza: ${i.lote} | Defecto: ${i.defecto} | Causa: ${i.causa} | Cant: ${i.cantidad}${i.observaciones ? ' | Obs: ' + i.observaciones : ''}`
      ).join('\n')

      const descripcion = `${itemsDesc}\n\nDetectado por: ${ncData.detectadoPor || ncData.departamento || 'A confirmar'}\nResolución: ${ncData.resolucion || 'A definir'}\nUrgencia: ${ncData.urgencia || 'A definir'}`

      // Título de la alerta
      const primerItem = (ncData.items || [])[0]
      const tituloAlerta = `NC - ${primerItem?.lote || obra || 'Sin especificar'} - ${primerItem?.defecto || 'Defecto'}`

      const alertaBody = `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${DB}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>quality.alert</string></value></param>
    <param><value><string>create</string></value></param>
    <param><value><array><data>
      <value><struct>
        <member><name>name</name><value><string>${tituloAlerta}</string></value></member>
        <member><name>description</name><value><string>${descripcion.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</string></value></member>
        <member><name>priority</name><value><string>${prioridad}</string></value></member>
        ${ericUserId ? `<member><name>user_id</name><value><int>${ericUserId}</int></value></member>` : ''}
      </struct>
    </value></data></array></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`

      const alertaRes = await fetch(`${url}/xmlrpc/2/object`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: alertaBody
      })
      const alertaXml = await alertaRes.text()
      const alertaIdM = alertaXml.match(/<int>(\d+)<\/int>/)
      alertaId = alertaIdM ? parseInt(alertaIdM[1]) : null
    }

    return Response.json({
      ok: true,
      adjunto_id: adjuntoId,
      msg_id: msgIdM ? parseInt(msgIdM[1]) : null,
      notificados: partnerIds.length,
      imagenes_subidas: imagenesSubidas,
      alerta_calidad_id: alertaId,
    })

  } catch (error) {
    console.error('Error guardar-odoo:', error)
    return Response.json({ error: error?.message }, { status: 500 })
  }
}
