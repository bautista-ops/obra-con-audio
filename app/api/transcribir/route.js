export const maxDuration = 60

export async function POST(request) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio')

    if (!audioFile) {
      return Response.json({ error: 'No se recibió audio' }, { status: 400 })
    }

    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mimeType = audioFile.type || 'audio/webm'

    console.log(`Transcribiendo con Anthropic: tipo: ${mimeType}, tamaño: ${buffer.length} bytes`)

    if (buffer.length < 500) {
      return Response.json({ error: 'El audio es demasiado corto' }, { status: 400 })
    }

    const base64Audio = buffer.toString('base64')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Transcribí exactamente lo que se dice en este audio. Devolvé solo el texto transcripto, sin comentarios ni explicaciones adicionales. El audio está en español rioplatense.'
              },
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: base64Audio
                }
              }
            ]
          }
        ]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Error Anthropic:', data)
      throw new Error(data.error?.message || 'Error de Anthropic')
    }

    const texto = data.content?.[0]?.text?.trim()
    if (!texto) throw new Error('No se obtuvo transcripción')

    console.log('Transcripción exitosa:', texto.substring(0, 100))
    return Response.json({ texto })

  } catch (error) {
    console.error('Error transcripción:', error?.message || error)
    return Response.json({
      error: 'Error al transcribir el audio',
      detalle: error?.message || 'Error desconocido'
    }, { status: 500 })
  }
}
