export const maxDuration = 30

export async function GET() {
  try {
    const loginRes = await fetch(`${process.env.ODOO_URL}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          db: 'grupomsh',
          login: process.env.ODOO_USER,
          password: process.env.ODOO_API_KEY
        }
      })
    })

    const loginData = await loginRes.json()
    const uid = loginData?.result?.uid
    const sessionId = loginData?.result?.session_id

    if (!uid) {
      console.error('Login Odoo fallido:', JSON.stringify(loginData?.error || loginData?.result))
      return Response.json({ error: 'No se pudo autenticar con Odoo' }, { status: 401 })
    }

    console.log(`Odoo login OK, uid: ${uid}`)

    const cookies = loginRes.headers.get('set-cookie') || `session_id=${sessionId}`

    const crmRes = await fetch(`${process.env.ODOO_URL}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies
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

    if (crmData?.error) {
      console.error('Error CRM:', JSON.stringify(crmData.error))
      return Response.json({ error: 'Error al consultar el CRM' }, { status: 500 })
    }

    const proyectos = (crmData?.result || []).map(p => ({
      id: p.id,
      nombre: p.name,
      cliente: p.partner_id ? p.partner_id[1] : null,
      comercial: p.user_id ? p.user_id[1] : null,
      etapa: p.stage_id ? p.stage_id[1] : null,
    }))

    console.log(`Proyectos obtenidos: ${proyectos.length}`)
    return Response.json({ proyectos })

  } catch (error) {
    console.error('Error proyectos:', error?.message || error)
    return Response.json({ error: 'Error al conectar con Odoo' }, { status: 500 })
  }
}
