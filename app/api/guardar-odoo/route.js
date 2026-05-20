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

async function crearAdjunto(url, apiKey, uid, nombre, base64, mimeType, resModel, resId) {
  const res = await fetch(`${url}/xmlrpc/2/object`, {
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
        <member><name>name</name><value><string>${nombre}</string></value></member>
        <member><name>type</name><value><string>binary</string></value></member>
        <member><name>datas</name><value><string>${base64}</string></value></member>
        <member><name>mimetype</name><value><string>${mimeType}</string></value></member>
        <member><name>res_model</name><value><string>${resModel}</string></value></member>
        <member><name>res_id</name><value><int>${resId}</int></value></member>
      </struct>
    </value></data></array></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`
  })
  const xml = await res.text()
  const m = xml.match(/<int>(\d+)<\/int>/)
  return m ? parseInt(m[1]) : null
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

    // 1. PDF adjunto al CRM
    const adjuntoId = await crearAdjunto(url, apiKey, uid, pdf_nombre, pdf_base64, 'application/pdf', 'crm.lead', proyecto_id)
    if (!adjuntoId) return Response.json({ error: 'No se pudo crear el adjunto PDF' }, { status: 500 })

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
    const partnerMember = partnerIds.length > 0
      ? `<member><name>partner_ids</name><value><array><data>${partnerIdsXml}</data></array></value></member>`
      : ''

    // 3. Nota en chatter del CRM
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
      ${partnerMember}
    </struct></value></param>
  </params>
</methodCall>`
    })
    const notaXml = await notaRes.text()
    const msgIdM = notaXml.match(/<int>(\d+)<\/int>/)

    // 4. Imágenes adjuntas al CRM
    let imagenesSubidas = 0
    if (ncData?.items) {
      for (const item of ncData.items) {
        for (let idx = 0; idx < (item.imagenes || []).length; idx++) {
          const img = item.imagenes[idx]
          const nombre = `NC_${(item.lote || 'pieza').replace(/[^a-z0-9]/gi, '_')}_foto${idx + 1}.jpg`
          await crearAdjunto(url, apiKey, uid, nombre, img.base64, 'image/jpeg', 'crm.lead', proyecto_id)
          imagenesSubidas++
        }
      }
    }

    // 5. Alertas de calidad — UNA POR PIEZA
    const alertaIds = []
    if (tipo === 'nc' && ncData?.items?.length > 0) {

      // Buscar user_id de Eric
      const ericRes = await fetch(`${url}/xmlrpc/2/object`, {
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
        </data></array></value>
      </member>
      <member><name>limit</name><value><int>1</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`
      })
      const ericXml = await ericRes.text()
      const ericIdM = ericXml.match(/<name>id<\/name>\s*<value><int>(\d+)<\/int>/)
      const ericUserId = ericIdM ? parseInt(ericIdM[1]) : null

      const prioridadMap = { 'Alta': '2', 'Media': '1', 'Baja': '0' }
      const prioridad = prioridadMap[ncData.gravedad] || '0'
      const detectadoPorStr = ncData.detectadoPor
        ? `${ncData.detectadoPor}${ncData.departamento ? ` (${ncData.departamento})` : ''}`
        : ncData.departamento || 'A confirmar'

      for (const item of ncData.items) {
        const titulo = `NC - ${ncData.proyecto || obra || 'Sin especificar'} - ${item.lote || 'Pieza'} - ${item.defecto || 'Defecto'}`
        const descripcion = [
          `Lote/Pieza: ${item.lote || 'Sin especificar'}`,
          `Producto: ${item.producto || ''}`,
          `Defecto: ${item.defecto || 'A relevar'}`,
          `Causa: ${item.causa || 'A relevar'}`,
          `Cantidad: ${item.cantidad || 1}`,
          item.observaciones ? `Observaciones: ${item.observaciones}` : '',
          '',
          `Detectado por: ${detectadoPorStr}`,
          `Resolución: ${ncData.resolucion || 'A definir'}`,
          `Gravedad: ${ncData.gravedad || 'A definir'}`,
          `Urgencia: ${ncData.urgencia || 'A definir'}`,
        ].filter(Boolean).join('\n')

        const desc = descripcion
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '&#10;')

        const alertaRes = await fetch(`${url}/xmlrpc/2/object`, {
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
    <param><value><string>create</string></value></param>
    <param><value><array><data>
      <value><struct>
        <member><name>name</name><value><string>${titulo}</string></value></member>
        <member><name>description</name><value><string>${desc}</string></value></member>
        <member><name>priority</name><value><string>${prioridad}</string></value></member>
        ${ericUserId ? `<member><name>user_id</name><value><int>${ericUserId}</int></value></member>` : ''}
      </struct>
    </value></data></array></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`
        })

        const alertaXml = await alertaRes.text()
        const alertaIdM = alertaXml.match(/<int>(\d+)<\/int>/)
        const alertaId = alertaIdM ? parseInt(alertaIdM[1]) : null
        if (alertaId) {
          alertaIds.push(alertaId)
          // Fotos adjuntas a esta alerta
          for (let idx = 0; idx < (item.imagenes || []).length; idx++) {
            const img = item.imagenes[idx]
            const nombre = `NC_${(item.lote || 'pieza').replace(/[^a-z0-9]/gi, '_')}_foto${idx + 1}.jpg`
            await crearAdjunto(url, apiKey, uid, nombre, img.base64, 'image/jpeg', 'quality.alert', alertaId)
          }
        }
      }
    }

    return Response.json({
      ok: true,
      adjunto_id: adjuntoId,
      msg_id: msgIdM ? parseInt(msgIdM[1]) : null,
      notificados: partnerIds.length,
      imagenes_subidas: imagenesSubidas,
      alertas_calidad: alertaIds.length,
      alerta_ids: alertaIds,
    })

  } catch (error) {
    console.error('Error guardar-odoo:', error)
    return Response.json({ error: error?.message }, { status: 500 })
  }
}
