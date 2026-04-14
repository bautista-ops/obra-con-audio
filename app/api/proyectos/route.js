export const maxDuration = 30

export async function GET() {
  try {
    const url = process.env.ODOO_URL
    const user = process.env.ODOO_USER
    const apiKey = process.env.ODOO_API_KEY

    const uidRes = await fetch(`${url}/xmlrpc/2/common`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>grupomsh-main-16859458</string></value></param>
    <param><value><string>${user}</string></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`
    })

    const uidText = await uidRes.text()
    const uidMatch = uidText.match(/<value><int>(\d+)<\/int><\/value>/)
    const uid = uidMatch ? parseInt(uidMatch[1]) : null

    if (!uid) {
      return Response.json({ error: 'Auth fallida', raw: uidText.substring(0, 500) }, { status: 401 })
    }

    const searchRes = await fetch(`${url}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>grupomsh-main-16859458</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>crm.lead</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param><value><array><data>
      <value><array><data></data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member>
        <name>fields</name>
        <value><array><data>
          <value><string>id</string></value>
          <value><string>name</string></value>
          <value><string>partner_id</string></value>
          <value><string>user_id</string></value>
          <value><string>stage_id</string></value>
        </data></array></value>
      </member>
      <member>
        <name>limit</name>
        <value><int>3</int></value>
      </member>
    </struct></value></param>
  </params>
</methodCall>`
    })

    const searchText = await searchRes.text()
    
    // Return raw XML so we can see the structure
    return new Response(searchText.substring(0, 3000), {
      headers: { 'Content-Type': 'text/plain' }
    })

  } catch (error) {
    return Response.json({ error: error?.message }, { status: 500 })
  }
}
