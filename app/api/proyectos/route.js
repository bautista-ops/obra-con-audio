export const maxDuration = 30

export async function GET() {
  try {
    const url = process.env.ODOO_URL
    const user = process.env.ODOO_USER
    const apiKey = process.env.ODOO_API_KEY
    const db = 'grupomsh-main-16859458'

    // Step 1: authenticate
    const loginRes = await fetch(`${url}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { db, login: user, password: apiKey }
      })
    })

    const loginData = await loginRes.json()
    const uid = loginData?.result?.uid
    const sessionId = loginRes.headers.get('set-cookie')?.match(/session_id=([^;]+)/)?.[1]
      || loginData?.result?.session_id

    console.log(`Login result - uid: ${uid}, session: ${sessionId ? 'ok' : 'missing'}`)

    if (!uid) {
      return Response.json({ error: 'Auth fallida', detail: loginData?.error || loginData?.result }, { status: 401 })
    }

    // Step 2: get projects from CRM
    const crmRes = await fetch(`${url}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session_id=${sessionId}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'crm.lead',
          method: 'search_read',
          args: [[['active', '=', true]]],
          kwargs: {
            fields: ['id', 'name', 'partner_id', 'user_id', 'stage_id'],
            limit: 200,
            order: 'name asc'
          }
        }
      })
    })

    const crmData = await crmRes.json()
    console.log(`CRM response - error: ${JSON.stringify(crmData?.error)}, records: ${crmData?.result?.length}`)

    if (crmData?.error) {
      return Response.json({ error: 'Error CRM', detail: crmData.error }, { status: 500 })
    }

    const todosProyectos = crmData?.result || []

    // Filter by stage name containing "won", "ganado" or "cotiz"
    const proyectos = todosProyectos
      .filter(p => {
        const etapa = (p.stage_id?.[1] || '').toLowerCase()
        return etapa.includes('won') || etapa.includes('ganado') || etapa.includes('cotiz')
      })
      .map(p => ({
        id: p.id,
        nombre: p.name,
        cliente: Array.isArray(p.partner_id) ? p.partner_id[1] : null,
        comercial: Array.isArray(p.user_id) ? p.user_id[1] : null,
        etapa: Array.isArray(p.stage_id) ? p.stage_id[1] : null,
      }))

    console.log(`Total: ${todosProyectos.length}, Filtrados: ${proyectos.length}`)
    return Response.json({ proyectos })

  } catch (error) {
    console.error('Error proyectos:', error?.message || error)
    return Response.json({ error: 'Error al conectar con Odoo' }, { status: 500 })
  }
}
