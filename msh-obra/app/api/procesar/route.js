import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 3,
  timeout: 60000,
})

export const maxDuration = 60

export async function POST(request) {
  try {
    const { tipo, resolucion, input, proyectos } = await request.json()

    if (!input || !tipo) {
      return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const proyectosContext = proyectos?.length
      ? `\nTenés disponible la siguiente lista de proyectos del CRM de MSH. Cuando el texto mencione un proyecto (por nombre, número o cliente), identificá cuál es y usá su información:\n${JSON.stringify(proyectos.map(p => ({ id: p.id, nombre: p.nombre, cliente: p.cliente, comercial: p.comercial, etapa: p.etapa })), null, 2)}\n`
      : ''

    let systemPrompt
    if (tipo === 'minuta') {
      systemPrompt = `Sos un asistente de obra para Grupo MSH, empresa metalúrgica argentina especializada en soluciones arquitectónicas metálicas (fachadas, revestimientos, cielorrasos, parasoles).
${proyectosContext}
Extraé del texto los datos para una minuta de obra y respondé SOLO con un JSON válido, sin markdown, sin texto extra:
{
  "tipo": "minuta",
  "obra": "nombre del proyecto tal como figura en el CRM si lo encontraste, sino el nombre mencionado",
  "proyecto_id": "id numérico del proyecto en el CRM si lo identificaste, sino null",
  "cliente": "nombre del cliente si lo identificaste del CRM, sino null",
  "comercial": "nombre del comercial a cargo si lo identificaste del CRM, sino null",
  "etapa": "etapa del proyecto en el CRM si lo identificaste, sino null",
  "fecha": "fecha mencionada o dejar vacío si no se menciona",
  "asistentes": ["lista de personas mencionadas"],
  "temas": ["lista de temas tratados"],
  "acuerdos": ["lista de acuerdos o decisiones tomadas"],
  "pendientes": ["lista de puntos pendientes, incluir responsable si se menciona"],
  "asunto_email": "asunto sugerido para el correo"
}`
    } else {
      systemPrompt = `Sos un asistente de obra para Grupo MSH, empresa metalúrgica argentina especializada en soluciones arquitectónicas metálicas.
${proyectosContext}
Extraé del texto los datos para una no conformidad y respondé SOLO con un JSON válido, sin markdown, sin texto extra:
{
  "tipo": "nc",
  "proyecto": "nombre del proyecto tal como figura en el CRM si lo encontraste, sino el nombre mencionado",
  "proyecto_id": "id numérico del proyecto en el CRM si lo identificaste, sino null",
  "cliente": "nombre del cliente si lo identificaste del CRM, sino null",
  "comercial": "nombre del comercial a cargo si lo identificaste del CRM, sino null",
  "producto": "nombre del producto o material afectado",
  "sector": "sector de la obra donde ocurrió",
  "descripcion": "descripción clara y completa del problema",
  "resolucion": "${resolucion === 'refab' ? 'Requiere refabricación' : 'Se resuelve en obra'}"
}`
    }

    let lastError
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const message = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: 'user', content: input }]
        })

        const raw = message.content[0].text.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(raw)
        return Response.json(parsed)

      } catch (err) {
        lastError = err
        const isOverloaded = err?.status === 529 || err?.message?.includes('overloaded')
        if (isOverloaded && attempt < 3) {
          console.log(`Intento ${attempt} fallido por sobrecarga, reintentando en ${attempt * 2}s...`)
          await new Promise(r => setTimeout(r, attempt * 2000))
          continue
        }
        throw err
      }
    }

    throw lastError

  } catch (error) {
    console.error('Error:', error?.message || error)
    const isOverloaded = error?.status === 529 || error?.message?.includes('overloaded')
    return Response.json({
      error: isOverloaded
        ? 'El servicio está temporalmente saturado. Esperá unos segundos y volvé a intentar.'
        : 'Error al procesar el contenido'
    }, { status: 500 })
  }
}
