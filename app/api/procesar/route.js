import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request) {
  try {
    const { tipo, resolucion, input } = await request.json()

    if (!input || !tipo) {
      return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    let systemPrompt
    if (tipo === 'minuta') {
      systemPrompt = `Sos un asistente de obra para Grupo MSH, empresa metalúrgica argentina especializada en soluciones arquitectónicas metálicas (fachadas, revestimientos, cielorrasos, parasoles).
Extraé del texto los datos para una minuta de obra y respondé SOLO con un JSON válido, sin markdown, sin texto extra:
{
  "tipo": "minuta",
  "obra": "nombre del proyecto/obra",
  "fecha": "fecha mencionada o dejar vacío si no se menciona",
  "asistentes": ["lista de personas mencionadas"],
  "temas": ["lista de temas tratados"],
  "acuerdos": ["lista de acuerdos o decisiones tomadas"],
  "pendientes": ["lista de puntos pendientes, incluir responsable si se menciona"],
  "asunto_email": "asunto sugerido para el correo"
}`
    } else {
      systemPrompt = `Sos un asistente de obra para Grupo MSH, empresa metalúrgica argentina especializada en soluciones arquitectónicas metálicas.
Extraé del texto los datos para una no conformidad y respondé SOLO con un JSON válido, sin markdown, sin texto extra:
{
  "tipo": "nc",
  "proyecto": "nombre del proyecto/obra",
  "producto": "nombre del producto o material afectado",
  "sector": "sector de la obra donde ocurrió",
  "descripcion": "descripción clara y completa del problema",
  "resolucion": "${resolucion === 'refab' ? 'Requiere refabricación' : 'Se resuelve en obra'}"
}`
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: input }]
    })

    const raw = message.content[0].text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(raw)

    return Response.json(parsed)
  } catch (error) {
    console.error('Error:', error)
    return Response.json({ error: 'Error al procesar el contenido' }, { status: 500 })
  }
}
