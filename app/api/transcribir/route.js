import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio')

    if (!audioFile) {
      return Response.json({ error: 'No se recibió audio' }, { status: 400 })
    }

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'es',
    })

    return Response.json({ texto: transcription.text })
  } catch (error) {
    console.error('Error Whisper:', error)
    return Response.json({ error: 'Error al transcribir el audio' }, { status: 500 })
  }
}
