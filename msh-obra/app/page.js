'use client'

import { useState, useRef, useEffect } from 'react'
import styles from './page.module.css'

export default function Home() {
  const [step, setStep] = useState('input') // input | loading | result
  const [tipo, setTipo] = useState(null)
  const [resolucion, setResolucion] = useState(null)
  const [inputText, setInputText] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('Analizando el contenido...')
  const [proyectos, setProyectos] = useState([])
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  useEffect(() => {
    fetch('/api/proyectos')
      .then(r => r.json())
      .then(data => {
        if (data.proyectos) {
          setProyectos(data.proyectos)
          console.log(`Proyectos cargados: ${data.proyectos.length}`)
        }
      })
      .catch(e => console.error('Error cargando proyectos:', e))
  }, [])

  const canSubmit = inputText.trim().length > 5 && tipo !== null && (tipo !== 'nc' || resolucion !== null)

  const selectTipo = (t) => {
    setTipo(t)
    if (t === 'minuta') setResolucion(null)
  }

  const toggleRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Tu navegador no soporta reconocimiento de voz. Usá Chrome en Android o Safari en iPhone.')
      return
    }

    if (!isRecording) {
      const recognition = new SpeechRecognition()
      recognition.lang = 'es-AR'
      recognition.continuous = true
      recognition.interimResults = true
      mediaRecorderRef.current = recognition
      let finalTranscript = ''

      recognition.onresult = (event) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interim += transcript
          }
        }
        setInputText(finalTranscript + interim)
      }

      recognition.onerror = (event) => {
        console.error('Error reconocimiento:', event.error)
        setIsRecording(false)
        setAudioReady('error')
      }

      recognition.onend = () => {
        setIsRecording(false)
        if (finalTranscript.trim()) {
          setInputText(finalTranscript.trim())
          setAudioReady('listo')
        } else {
          setAudioReady('error')
        }
      }

      recognition.start()
      setIsRecording(true)
      setAudioReady(null)
    } else {
      mediaRecorderRef.current?.stop()
    }
  }

  const processInput = async () => {
    if (!canSubmit) return
    setStep('loading')
    setError(null)
    setCopied(false)

    const msgs = ['Analizando el contenido...', 'Identificando campos clave...', 'Estructurando el documento...']
    let idx = 0
    const interval = setInterval(() => {
      idx = (idx + 1) % msgs.length
      setLoadingMsg(msgs[idx])
    }, 1800)

    try {
      const res = await fetch('/api/procesar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, resolucion, input: inputText, proyectos })
      })
      const data = await res.json()
      clearInterval(interval)
      if (!res.ok) throw new Error(data.error || 'Error del servidor')
      setResult(data)
      setStep('result')
    } catch (e) {
      clearInterval(interval)
      setError(e.message)
      setStep('result')
    }
  }

  const buildCuerpoMinuta = (data) => {
    const temas = (data.temas || []).map(t => `• ${t}`).join('\n')
    const acuerdos = (data.acuerdos || []).map(a => `• ${a}`).join('\n')
    const pendientes = (data.pendientes || []).map(p => `• ${p}`).join('\n')
    return `Hola, buenos días.\n\nAdjunto minuta de la reunión de obra.\n`
      + (temas ? `\nTEMAS TRATADOS\n${temas}\n` : '')
      + (acuerdos ? `\nACUERDOS\n${acuerdos}\n` : '')
      + (pendientes ? `\nPENDIENTES\n${pendientes}\n` : '')
      + `\nCualquier consulta, a disposición.\nMuchas gracias.\nSaludo atte.`
  }

  const buildReporteNC = (data) => {
    return `NO CONFORMIDAD — ${data.proyecto || ''}\n\nProducto: ${data.producto || '—'}\nSector: ${data.sector || '—'}\nProblema: ${data.descripcion || '—'}\nResolución: ${data.resolucion || '—'}`
  }

  const copyText = () => {
    if (!result) return
    const text = result.tipo === 'minuta' ? buildCuerpoMinuta(result) : buildReporteNC(result)
    navigator.clipboard.writeText(text).then(() => setCopied(true))
  }

  const reset = () => {
    setStep('input')
    setTipo(null)
    setResolucion(null)
    setInputText('')
    setResult(null)
    setError(null)
    setAudioReady(false)
    setCopied(false)
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.logo}>MSH</div>
          <div>
            <h1 className={styles.title}>Asistente de obra</h1>
            <p className={styles.subtitle}>Minutas y no conformidades</p>
          </div>
        </div>

        {step === 'input' && (
          <>
            <div className={styles.card}>
              <p className={styles.sectionLabel}>Tipo de registro</p>
              <div className={styles.typeGrid}>
                <button
                  className={`${styles.typeBtn} ${tipo === 'minuta' ? styles.selected : ''}`}
                  onClick={() => selectTipo('minuta')}
                >
                  <span className={styles.typeIcon}>📋</span>
                  <span className={styles.typeLabel}>Minuta</span>
                  <span className={styles.typeDesc}>Reunión de obra</span>
                </button>
                <button
                  className={`${styles.typeBtn} ${tipo === 'nc' ? styles.selected : ''}`}
                  onClick={() => selectTipo('nc')}
                >
                  <span className={styles.typeIcon}>⚠️</span>
                  <span className={styles.typeLabel}>No conformidad</span>
                  <span className={styles.typeDesc}>Problema o defecto</span>
                </button>
              </div>
            </div>

            {tipo === 'nc' && (
              <div className={styles.card}>
                <p className={styles.sectionLabel}>¿Cómo se resuelve?</p>
                <div className={styles.resolveGrid}>
                  <button
                    className={`${styles.resolveOpt} ${resolucion === 'obra' ? styles.selected : ''}`}
                    onClick={() => setResolucion('obra')}
                  >
                    <span className={styles.resolveLabel}>Se resuelve en obra</span>
                    <span className={styles.resolveSub}>Solución in situ</span>
                  </button>
                  <button
                    className={`${styles.resolveOpt} ${resolucion === 'refab' ? styles.selected : ''}`}
                    onClick={() => setResolucion('refab')}
                  >
                    <span className={styles.resolveLabel}>Requiere refabricación</span>
                    <span className={styles.resolveSub}>Vuelve a planta</span>
                  </button>
                </div>
              </div>
            )}

            <div className={styles.card}>
              <p className={styles.sectionLabel}>Contá qué pasó</p>
              <button
                className={`${styles.audioBtn} ${isRecording ? styles.recording : ''} ${audioReady === 'listo' ? styles.audioReady : ''} ${audioReady === 'transcribiendo' ? styles.audioTranscribiendo : ''} ${audioReady === 'error' ? styles.audioError : ''}`}
                onClick={toggleRecording}
                disabled={audioReady === 'transcribiendo'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
                {isRecording
                  ? 'Grabando... tocá para detener'
                  : audioReady === 'transcribiendo'
                  ? 'Transcribiendo...'
                  : audioReady === 'listo'
                  ? 'Audio transcripto ✓ — grabá otro si querés'
                  : audioReady === 'error'
                  ? 'Error al transcribir — intentá de nuevo'
                  : 'Grabar audio'}
              </button>
              <div className={styles.divider}>o escribí directamente</div>
              <textarea
                className={styles.textarea}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  tipo === 'nc'
                    ? 'Ej: En la obra Quba, sector frente, las piezas de Mini Metal Shape Panel llegaron rayadas. Son aproximadamente 7 piezas del tramo FV1...'
                    : tipo === 'minuta'
                    ? 'Ej: Reunión en obra Kerschen hoy. Estuvieron Enrique y Rodrigo del estudio. Se definió que los tubos no llevarán tapa. Quedó pendiente el plano de la garita...'
                    : 'Seleccioná el tipo de registro y describí qué pasó...'
                }
                rows={6}
              />
            </div>

            <button className={styles.btnPrimary} onClick={processInput} disabled={!canSubmit}>
              Generar documento
            </button>
          </>
        )}

        {step === 'loading' && (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <p>{loadingMsg}</p>
          </div>
        )}

        {step === 'result' && (
          <>
            {error && (
              <div className={styles.errorMsg}>
                <strong>Error:</strong> {error}
              </div>
            )}

            {result && result.tipo === 'minuta' && (
              <div className={styles.card}>
                <span className={styles.badgeMinuta}>Minuta de obra</span>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Obra</span>
                  <span className={styles.resultValue}>{result.obra || '—'}</span>
                </div>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Fecha</span>
                  <span className={styles.resultValue}>{result.fecha || '—'}</span>
                </div>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Asistentes</span>
                  <span className={styles.resultValue}>{(result.asistentes || []).join(', ') || '—'}</span>
                </div>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Asunto del mail</span>
                  <span className={styles.resultValue}>{result.asunto_email || '—'}</span>
                </div>
                <div className={styles.resultRow} style={{ flexDirection: 'column', gap: 6 }}>
                  <span className={styles.resultLabel}>Borrador del mail</span>
                  <pre className={styles.resultBody}>{buildCuerpoMinuta(result)}</pre>
                </div>
              </div>
            )}

            {result && result.tipo === 'nc' && (
              <div className={styles.card}>
                <span className={styles.badgeNC}>No conformidad</span>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Proyecto</span>
                  <span className={styles.resultValue}>{result.proyecto || '—'}</span>
                </div>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Producto</span>
                  <span className={styles.resultValue}>{result.producto || '—'}</span>
                </div>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Sector</span>
                  <span className={styles.resultValue}>{result.sector || '—'}</span>
                </div>
                <div className={styles.resultRow} style={{ flexDirection: 'column', gap: 6 }}>
                  <span className={styles.resultLabel}>Descripción del problema</span>
                  <pre className={styles.resultBody}>{result.descripcion || '—'}</pre>
                </div>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Resolución</span>
                  <span className={result.resolucion?.includes('refabricación') ? styles.tagRefab : styles.tagObra}>
                    {result.resolucion || '—'}
                  </span>
                </div>
              </div>
            )}

            {result && (
              <>
                <div className={styles.recipients}>
                  {result.tipo === 'minuta'
                    ? <>Destinatarios: <strong>Estudio del cliente · Enrique Suárez · Comercial a cargo</strong></>
                    : <>Notificar a: <strong>Responsable de operaciones · Jefe de planta</strong></>
                  }
                </div>
                <button className={styles.copyBtn} onClick={copyText}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  {copied ? 'Copiado ✓' : result.tipo === 'minuta' ? 'Copiar borrador' : 'Copiar reporte'}
                </button>
                {copied && (
                  <div className={styles.successMsg}>
                    <p>{result.tipo === 'minuta' ? 'Borrador copiado — pegalo en tu mail y revisalo antes de enviar' : 'Reporte copiado — envialo al responsable'}</p>
                  </div>
                )}
              </>
            )}

            <button className={styles.btnSecondary} onClick={reset}>
              Nuevo registro
            </button>
          </>
        )}
      </div>
    </main>
  )
}
