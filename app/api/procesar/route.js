import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 3,
  timeout: 60000,
})

export const maxDuration = 60

function filtrarProyectosRelevantes(proyectos, input) {
  if (!proyectos?.length) return []
  const inputLower = input.toLowerCase()
  const palabras = inputLower.split(/\s+/).filter(p => p.length > 3)

  const scored = proyectos.map(p => {
    const nombreLower = (p.nombre || '').toLowerCase()
    const clienteLower = (p.cliente || '').toLowerCase()
    let score = 0
    palabras.forEach(palabra => {
      if (nombreLower.includes(palabra)) score += 3
      if (clienteLower.includes(palabra)) score += 2
    })
    return { ...p, score }
  })

  const relevantes = scored.filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 10)
  if (relevantes.length > 0) return relevantes

  return proyectos.slice(0, 20)
}

export async function POST(request) {
  try {
    const { tipo, resolucion, input, proyectos, proyectoForzado } = await request.json()

    if (!input || !tipo) {
      return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    // If user selected a project manually, use it directly
    let proyectosContext = ''
    if (proyectoForzado) {
      proyectosContext = `\nEl usuario seleccionó manualmente este proyecto del CRM — usalo como el proyecto del documento:\n- ID: ${proyectoForzado.id} | Nombre: ${proyectoForzado.nombre} | Cliente: ${proyectoForzado.cliente || 'N/A'} | Comercial: ${proyectoForzado.comercial || 'N/A'} | Etapa: ${proyectoForzado.etapa || 'N/A'}\n`
    } else {
      const proyectosFiltrados = filtrarProyectosRelevantes(proyectos, input)
      proyectosContext = proyectosFiltrados.length
        ? `\nListado de proyectos del CRM de MSH (los más relevantes según el contexto):\n${proyectosFiltrados.map(p => `- ID: ${p.id} | Nombre: ${p.nombre} | Cliente: ${p.cliente || 'N/A'} | Comercial: ${p.comercial || 'N/A'} | Etapa: ${p.etapa || 'N/A'}`).join('\n')}\n`
        : ''
    }
    let systemPrompt
    if (tipo === 'minuta') {
      systemPrompt = `Sos un asistente de obra para Grupo MSH, empresa metalúrgica argentina especializada en soluciones arquitectónicas metálicas (fachadas, revestimientos, cielorrasos, parasoles).
${proyectosContext}
Extraé del texto los datos para una minuta de obra y respondé SOLO con un JSON válido, sin markdown, sin texto extra:
{
  "tipo": "minuta",
  "obra": "nombre del proyecto tal como figura en el CRM si lo identificaste, sino el nombre mencionado",
  "proyecto_id": null o número entero con el ID del proyecto si lo identificaste,
  "cliente": "nombre del cliente si lo identificaste, sino null",
  "comercial": "nombre del comercial a cargo si lo identificaste, sino null",
  "fecha": "fecha mencionada o vacío si no se menciona",
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
  "proyecto": "nombre del proyecto tal como figura en el CRM si lo identificaste, sino el nombre mencionado",
  "proyecto_id": null o número entero con el ID del proyecto si lo identificaste,
  "cliente": "nombre del cliente si lo identificaste, sino null",
  "comercial": "nombre del comercial a cargo si lo identificaste, sino null",
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
