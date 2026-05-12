export const maxDuration = 60

import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from '../../../lib/systemPrompt'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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

async function odooSearchRead(uid, model, filters, fields, limit = 200) {
  const url = process.env.ODOO_URL
  const apiKey = process.env.ODOO_API_KEY

  const filtersXml = filters.length === 0
    ? `<value><array><data></data></array></value>`
    : `<value><array><data><value><array><data>
        ${filters.map(([f, op, v]) => `<value><array><data>
          <value><string>${f}</string></value>
          <value><string>${op}</string></value>
          <value><string>${v}</string></value>
        </data></array></value>`).join('')}
      </data></array></value></data></array></value>`

  const fieldsXml = fields.map(f => `<value><string>${f}</string></value>`).join('')

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
    <param><value><string>${model}</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param>${filtersXml}</param>
    <param><value><struct>
      <member><name>fields</name><value><array><data>${fieldsXml}</data></array></value></member>
      <member><name>limit</name><value><int>${limit}</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`
  })

  const xml = await res.text()
  const records = []
  const blockRe = /<value>\s*<struct>([\s\S]*?)<\/struct>\s*<\/value>/g
  let block
  while ((block = blockRe.exec(xml)) !== null) {
    const obj = {}
    const memberRe = /<member>([\s\S]*?)<\/member>/g
    let m
    while ((m = memberRe.exec(block[1])) !== null) {
      const nameM = m[1].match(/<name>(.*?)<\/name>/)
      if (!nameM) continue
      const key = nameM[1]
      const intM = m[1].match(/<int>(\d+)<\/int>/)
      const strM = m[1].match(/<string>([^<]*)<\/string>/)
      const boolM = m[1].match(/<boolean>([01])<\/boolean>/)
      if (intM) obj[key] = parseInt(intM[1])
      else if (strM) obj[key] = strM[1]
      else if (boolM) obj[key] = boolM[1] === '1'
      else obj[key] = null
    }
    if (Object.keys(obj).length > 0) records.push(obj)
  }
  return records
}

// Postear nota interna en el chatter del proyecto en ODOO
async function postearNotaOdoo(uid, leadId, contenido) {
  const url = process.env.ODOO_URL
  const apiKey = process.env.ODOO_API_KEY

  // Escapar contenido para XML
  const contenidoEscapado = contenido
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')

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
    <param><value><string>crm.lead</string></value></param>
    <param><value><string>message_post</string></value></param>
    <param><value><array><data>
      <value><int>${leadId}</int></value>
    </data></array></value></param>
    <param><value><struct>
      <member><name>body</name><value><string>${contenidoEscapado}</string></value></member>
      <member><name>message_type</name><value><string>comment</string></value></member>
      <member><name>subtype_xmlid</name><value><string>mail.mt_note</string></value></member>
    </struct></value></param>
  </params>
</methodCall>`
  })

  const text = await res.text()
  const idM = text.match(/<int>(\d+)<\/int>/)
  return idM ? parseInt(idM[1]) : null
}

// Armar contenido de la nota para minutas
function armarNotaMinuta(parsed) {
  const fecha = parsed.fecha || new Date().toLocaleDateString('es-AR')
  const asistentes = (parsed.asistentes || []).join(', ') || 'A confirmar'
  const temas = (parsed.temas || []).map((t, i) => `${i + 1}. ${t}`).join('\n')
  const acuerdos = (parsed.acuerdos || []).map(a => `• ${a}`).join('\n')
  const pendientes = (parsed.pendientes || []).map(p => `• ${p}`).join('\n')

  return `📋 MINUTA DE REUNIÓN — ${fecha}
Registrada desde MSH Asistente de Obra

Lugar: ${parsed.lugar || 'A confirmar'}
Asistentes: ${asistentes}

TEMAS TRATADOS
${temas || 'Sin datos'}

ACUERDOS
${acuerdos || 'Sin acuerdos registrados'}

PENDIENTES
${pendientes || 'Sin pendientes'}

Próxima visita: ${parsed.proxima_visita || 'A definir'}`
}

// Armar contenido de la nota para NCs
function armarNotaNC(parsed) {
  const fecha = parsed.fecha || new Date().toLocaleDateString('es-AR')
  return `⚠️ NO CONFORMIDAD — ${fecha}
Registrada desde MSH Asistente de Obra

Producto: ${parsed.producto || 'A relevar'}
Causa: ${parsed.causa || 'A relevar'}
Sector origen: ${parsed.sector || 'A relevar'}
Descripción: ${parsed.descripcion || 'A relevar'}
Piezas afectadas: ${parsed.piezas_cantidad || 'A relevar'}
Resolución: ${parsed.resolucion || 'A definir'}
Costo estimado: ${parsed.costo_estimado || 'A calcular'}
Clasificación: ${parsed.clasificacion || 'A determinar'}`
}

export async function POST(request) {
  try {
    const { tipo, resolucion, input, proyectoForzado, fechaMinuta, asistentesMinuta } = await request.json()

    if (!input) {
      return Response.json({ error: 'Falta el contenido del mensaje' }, { status: 400 })
    }

    // Conectar a ODOO
    let proyectosCtx = []
    let uid = null
    try {
      uid = await odooAuth()
      if (uid) {
        const leads = await odooSearchRead(uid, 'crm.lead', [], ['id', 'name', 'partner_id', 'user_id', 'stage_id'], 200)
        proyectosCtx = leads
          .filter(r => {
            const etapa = (r.stage_id || '').toLowerCase()
            return etapa.includes('won') || etapa.includes('ganado') || etapa.includes('cotiz')
          })
          .map(r => ({
            id: r.id,
            nombre: r.name || '',
            cliente: r.partner_id || '',
            comercial: r.user_id || '',
            etapa: r.stage_id || '',
          }))
      }
    } catch (e) {
      console.error('ODOO error (no crítico):', e)
    }

    // Construir contexto
    const proyectoInfo = proyectoForzado
      ? `Proyecto seleccionado: ${proyectoForzado.nombre}${proyectoForzado.cliente ? ` | Cliente: ${proyectoForzado.cliente}` : ''}${proyectoForzado.comercial ? ` | Comercial: ${proyectoForzado.comercial}` : ''} | ID ODOO: ${proyectoForzado.id}`
      : 'Proyecto no seleccionado — inferir del texto'

    const asistentesInfo = asistentesMinuta && asistentesMinuta.length > 0
      ? `Asistentes confirmados: ${asistentesMinuta.join(', ')}`
      : 'Asistentes no seleccionados — extraer del texto'

    const fechaInfo = fechaMinuta
      ? `Fecha de la reunión: ${fechaMinuta}`
      : `Fecha de hoy: ${new Date().toISOString().split('T')[0]}`

    const resolucionInfo = tipo === 'nc' && resolucion
      ? `Resolución: ${resolucion === 'refab' ? 'Requiere refabricación' : 'Se resuelve en obra'}`
      : ''

    const proyectosLista = proyectosCtx.length > 0
      ? `\nProyectos activos en ODOO:\n${proyectosCtx.map(p => `- [ID:${p.id}] ${p.nombre}${p.cliente ? ` | ${p.cliente}` : ''}${p.comercial ? ` | Comercial: ${p.comercial}` : ''}`).join('\n')}`
      : ''

    const jsonInstruccion = tipo === 'minuta' ? `
Respondé ÚNICAMENTE con un JSON válido, sin texto adicional ni backticks. Estructura exacta:
{
  "tipo": "minuta",
  "obra": "nombre de la obra",
  "proyecto_id": null,
  "comercial": "nombre del comercial o null",
  "fecha": "DD/MM/AAAA",
  "lugar": "En obra / En planta / Videollamada",
  "asistentes": ["Nombre Apellido — Empresa/Rol"],
  "asunto_email": "Minuta de obra — [Nombre obra] — [Fecha]",
  "temas": ["descripción del tema 1"],
  "acuerdos": ["acuerdo con responsable y fecha"],
  "pendientes": ["pendiente con responsable"],
  "proxima_visita": "fecha o A definir"
}
` : `
Respondé ÚNICAMENTE con un JSON válido, sin texto adicional ni backticks. Estructura exacta:
{
  "tipo": "nc",
  "proyecto": "nombre del proyecto",
  "proyecto_id": null,
  "comercial": "nombre del comercial o null",
  "producto": "sistema MSH afectado",
  "terminacion": "pintura / anodizado / etc.",
  "sector": "área origen",
  "descripcion": "descripción del problema",
  "piezas_cantidad": "cantidad y tipo",
  "causa": "causa según historial MSH",
  "resolucion": "${resolucion === 'refab' ? 'Requiere refabricación' : 'Se resuelve en obra'}",
  "contramedidas": ["contramedida 1", "contramedida 2"],
  "precedente": "caso similar o null",
  "reincidencia": false,
  "costo_estimado": "estimación o A calcular",
  "clasificacion": "GRAVE o MENOR"
}
`

    const systemFinal = SYSTEM_PROMPT + '\n\n' + jsonInstruccion
    const userMsg = `
TIPO: ${tipo?.toUpperCase() || 'DETECTAR AUTOMÁTICAMENTE'}
${resolucionInfo}
${proyectoInfo}
${asistentesInfo}
${fechaInfo}
${proyectosLista}

RELATO DEL USUARIO:
${input}
`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemFinal,
      messages: [{ role: 'user', content: userMsg }]
    })

    const raw = response.content[0].text.trim()

    let parsed
    try {
      const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      parsed = JSON.parse(clean)
    } catch (e) {
      console.error('Error parseando JSON de Claude:', raw)
      return Response.json({ error: 'Error al estructurar el documento. Intentá de nuevo.' }, { status: 500 })
    }

    // Asignar ID de ODOO si el proyecto fue seleccionado
    if (proyectoForzado && parsed.proyecto_id === null) {
      parsed.proyecto_id = proyectoForzado.id
    }

    // Postear nota en ODOO si hay proyecto y uid disponibles
    if (uid && parsed.proyecto_id) {
      try {
        const contenido = parsed.tipo === 'minuta'
          ? armarNotaMinuta(parsed)
          : armarNotaNC(parsed)
        const msgId = await postearNotaOdoo(uid, parsed.proyecto_id, contenido)
        parsed.odoo_msg_id = msgId || null
      } catch (e) {
        console.error('Error posteando nota en ODOO (no crítico):', e)
        parsed.odoo_msg_id = null
      }
    }

    return Response.json(parsed)

  } catch (error) {
    console.error('Error:', error)
    return Response.json({ error: 'Error al procesar el documento. Intentá de nuevo.' }, { status: 500 })
  }
}
