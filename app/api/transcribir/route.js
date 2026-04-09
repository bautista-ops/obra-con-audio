import OpenAI from 'openai'
import { toFile } from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio')

    if (!audioFile) {
      return Response.json({ error: 'No se recibió audio' }, { status: 400 })
    }

    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const filename = audioFile.name || 'audio.webm'
    const mimeType = audioFile.type || 'audio/webm'

    console.log(`Transcribiendo: ${filename}, tipo: ${mimeType}, tamaño: ${buffer.length} bytes`)

    if (buffer.length < 1000) {
      return Response.json({ error: 'El audio es demasiado corto' }, { status: 400 })
    }

    const file = await toFile(buffer, filename, { type: mimeType })

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'es',
    })

    console.log('Transcripción exitosa:', transcription.text.substring(0, 100))
    return Response.json({ texto: transcription.text })

  } catch (error) {
    console.error('Error Whisper:', error?.message || error)
    return Response.json({
      error: 'Error al transcribir el audio',
      detalle: error?.message || 'Error desconocido'
    }, { status: 500 })
  }
}
