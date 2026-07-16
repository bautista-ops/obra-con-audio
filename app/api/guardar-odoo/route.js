import { subirMinutaADrive } from './drive.js'

export const maxDuration = 60

const DB = 'grupomsh-main-16859458'

// Mapeo causas agente → quality.reason IDs en ODOO
const CAUSA_MAP = {
  'Planos / Doc.': 5,       // Planos / Documentación
  'Fabricación': 6,          // Fabricación
  'Máquina': 1,              // Falla en el centro de trabajo
  'Proveedor': 7,            // Proveedor
  'Comunicación': 8,         // Comunicación
  'Logística': 9,            // Logística
  'Otra': 4,                 // Others
}

const PRIORIDAD_MAP = { 'Alta': '3', 'Media': '2', 'Baja': '1' }

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
    const { proyecto_id, tipo, fecha, obra, pdf_base64, pdf_nombre, ncData, destino, fotosMinuta } = await request.json()

    if (!proyecto_id || !pdf_base64) {
      return Response.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    const url = process.env.ODOO_URL
    const apiKey = process.env.ODOO_API_KEY
    const uid = await odooAuth()
    if (!uid) return Response.json({ error: 'Auth ODOO fallida' }, { status: 401 })

    console.log('[guardar-odoo] destino:', destino, '| ncData items:', ncData?.items?.length, '| proyecto_id:', proyecto_id)
    const guardarCRM = !destino || destino === 'crm' || destino === 'ambos'
    const guardarCalidad = !destino || destino === 'calidad' || destino === 'ambos'

    let adjuntoId = null
    let msgId = null

    // ── CRM ──────────────────────────────────────────────
    if (guardarCRM) {
      adjuntoId = await crearAdjunto(url, apiKey, uid, pdf_nombre, pdf_base64, 'application/pdf', 'crm.lead', proyecto_id)

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
      <member><name>fields</name><value><array><data><value><string>id</string></value></data></array></value></member>
      <member><name>limit</name><value><int>5</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`
      })
      const partnerXml = await partnerRes.text()
      const partnerIds = []
      for (const m of partnerXml.matchAll(/<name>id<\/name>\s*<value><int>(\d+)<\/int>/g)) partnerIds.push(parseInt(m[1]))
      const partnerIdsXml = partnerIds.map(id =>
        `<value><array><data><value><int>4</int></value><value><int>0</int></value><value><int>${id}</int></value></data></array></value>`
      ).join('')
      const partnerMember = partnerIds.length > 0
        ? `<member><name>partner_ids</name><value><array><data>${partnerIdsXml}</data></array></value></member>`
        : ''

      const tipoLabel = tipo === 'minuta' ? '📋 Minuta de reunión' : '⚠️ No Conformidad'
      const cuerpoNota = `${tipoLabel} — ${fecha || new Date().toLocaleDateString('es-AR')}&lt;br/&gt;Obra: ${obra || 'Sin especificar'}&lt;br/&gt;&lt;br/&gt;Registrada desde MSH Asistente de Obra. Ver PDF adjunto.`
      const attachXml = adjuntoId ? `<member><name>attachment_ids</name><value><array><data><value><array><data><value><int>4</int></value><value><int>0</int></value><value><int>${adjuntoId}</int></value></data></array></value></data></array></value></member>` : ''

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
    <param><value><array><data><value><int>${proyecto_id}</int></value></data></array></value></param>
    <param><value><struct>
      <member><name>body</name><value><string>${cuerpoNota}</string></value></member>
      <member><name>message_type</name><value><string>comment</string></value></member>
      <member><name>subtype_xmlid</name><value><string>mail.mt_note</string></value></member>
      ${attachXml}
      ${partnerMember}
    </struct></value></param>
  </params>
</methodCall>`
      })
      const notaXml = await notaRes.text()
      const msgM = notaXml.match(/<int>(\d+)<\/int>/)
      if (msgM) msgId = parseInt(msgM[1])

      // Fotos al CRM
      if (ncData?.items) {
        for (const item of ncData.items) {
          for (let idx = 0; idx < (item.imagenes || []).length; idx++) {
            const img = item.imagenes[idx]
            const nombre = `NC_${(item.lote || 'pieza').replace(/[^a-z0-9]/gi, '_')}_foto${idx + 1}.jpg`
            await crearAdjunto(url, apiKey, uid, nombre, img.base64, 'image/jpeg', 'crm.lead', proyecto_id)
          }
        }
      }
    }

    // ── DRIVE (minutas) ──────────────────────────────────────
    let driveResult = null
    if (tipo === 'minuta' && pdf_base64) {
      try {
        driveResult = await subirMinutaADrive(obra, pdf_base64, fecha)
        if (!driveResult.ok) {
          console.error('[guardar-odoo] Drive upload falló:', driveResult.error)
        } else {
          console.log('[guardar-odoo] Minuta subida a Drive:', driveResult.fileName, driveResult.folderUrl)
        }
      } catch (driveErr) {
        console.error('[guardar-odoo] Error inesperado en Drive:', driveErr)
        driveResult = { ok: false, error: driveErr.message }
      }
    }

    // ── FOTOS MINUTA ─────────────────────────────────────────
    if (tipo === 'minuta' && fotosMinuta && fotosMinuta.length > 0 && guardarCRM) {
      for (let i = 0; i < fotosMinuta.length; i++) {
        const foto = fotosMinuta[i]
        const base64 = foto.base64 || (foto.startsWith('data:') ? foto.split(',')[1] : foto)
        const nombre = `foto_minuta_${i + 1}.jpg`
        await crearAdjunto(url, apiKey, uid, nombre, base64, 'image/jpeg', 'crm.lead', proyecto_id)
      }
      console.log(`[guardar-odoo] ${fotosMinuta.length} fotos de minuta adjuntadas al CRM`)
    }

    // ── CALIDAD ───────────────────────────────────────────
    const alertaIds = []
    if (tipo === 'nc' && guardarCalidad && ncData?.items?.length > 0) {

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
      <member><name>fields</name><value><array><data><value><string>id</string></value></data></array></value></member>
      <member><name>limit</name><value><int>1</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`
      })
      const ericXml = await ericRes.text()
      const ericIdM = ericXml.match(/<name>id<\/name>\s*<value><int>(\d+)<\/int>/)
      const ericUserId = ericIdM ? parseInt(ericIdM[1]) : null

      const prioridad = PRIORIDAD_MAP[ncData.urgencia] || PRIORIDAD_MAP[ncData.gravedad] || '0'

      // Obtener el último número de NC para numeración correlativa
      const countRes = await fetch(`${url}/xmlrpc/2/object`, {
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
    <param><value><string>search_count</string></value></param>
    <param><value><array><data>
      <value><array><data></data></array></value>
    </data></array></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`
      })
      const countXml = await countRes.text()
      const countM = countXml.match(/<int>(\d+)<\/int>/)
      let ncCounter = countM ? parseInt(countM[1]) : 0
      const detectadoPorStr = ncData.detectadoPor
        ? `${ncData.detectadoPor}${ncData.departamento ? ` (${ncData.departamento})` : ''}`
        : ncData.departamento || 'A confirmar'

      for (const item of ncData.items) {
        ncCounter++
        const ncNum = String(ncCounter).padStart(4, '0')
        const titulo = `NC-${ncNum} - ${ncData.proyecto || obra || 'Sin especificar'} - ${item.lote || 'Pieza'} - ${item.defecto || 'Defecto'}`

        // Descripción = observaciones del usuario (campo principal)
        const descHtml = item.observaciones
          ? `<p>${item.observaciones}</p>`
          : `<p>Defecto: ${item.defecto || 'A relevar'} | Causa: ${item.causa || 'A relevar'} | Detectado por: ${detectadoPorStr}</p>`

        const productMember = '' // product_tmpl_id requiere ID de product.template — se completa manualmente en ODOO

        // lot_id — ID del lote seleccionado
        const lotMember = item.lote_id ? `<member><name>lot_id</name><value><int>${item.lote_id}</int></value></member>` : ''

        // Origen: usar reason_id del frontend si viene, sino mapear por causa del item
        const reasonId = ncData.origenReasonId || CAUSA_MAP[item.causa] || null
        const reasonMember = reasonId ? `<member><name>reason_id</name><value><int>${reasonId}</int></value></member>` : ''
        const ericMember = ericUserId ? `<member><name>user_id</name><value><int>${ericUserId}</int></value></member>` : ''

        // Pieza texto libre (cuando no hay lote catalogado)
        const textoLibreMember = item.textoLibre
          ? `<member><name>x_pieza_texto_libre</name><value><string>${item.textoLibre}</string></value></member>
             <member><name>x_pieza_no_catalogada</name><value><boolean>1</boolean></value></member>`
          : ''

        // Responsable (empleado o externo)
        const respEmpleadoMember = ncData.responsableEmpleadoId
          ? `<member><name>x_responsable_empleado</name><value><int>${ncData.responsableEmpleadoId}</int></value></member>`
          : ''
        const respExternoMember = ncData.responsableExterno
          ? `<member><name>x_responsable_externo</name><value><string>${ncData.responsableExterno}</string></value></member>`
          : ''

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
        <member><name>title</name><value><string>${titulo}</string></value></member>
        <member><name>description</name><value><string>${descHtml}</string></value></member>
        <member><name>priority</name><value><string>${prioridad}</string></value></member>
        ${reasonMember}
        ${ericMember}
        ${productMember}
        ${lotMember}
        ${textoLibreMember}
        ${respEmpleadoMember}
        ${respExternoMember}
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
      msg_id: msgId,
      alertas_calidad: alertaIds.length,
      alerta_ids: alertaIds,
      drive: driveResult || null,
    })

  } catch (error) {
    console.error('Error guardar-odoo:', error)
    return Response.json({ error: error?.message }, { status: 500 })
  }
}
