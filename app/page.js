'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
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
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [mostrarResultados, setMostrarResultados] = useState(false)
  const [empleados, setEmpleados] = useState([])
  const [asistentes, setAsistentes] = useState([])
  const [busquedaAsistente, setBusquedaAsistente] = useState('')
  const [mostrarAsistentes, setMostrarAsistentes] = useState(false)
  const [fechaMinuta, setFechaMinuta] = useState(() => new Date().toISOString().split('T')[0])
  const [emailCliente, setEmailCliente] = useState('')
  const [contactoNombre, setContactoNombre] = useState('')
  const [emailComercial, setEmailComercial] = useState('')
  const [indiceProyecto, setIndiceProyecto] = useState(-1)
  const [guardandoOdoo, setGuardandoOdoo] = useState(false)
  const [guardadoOdoo, setGuardadoOdoo] = useState(false)
  const [indiceAsistente, setIndiceAsistente] = useState(-1)
  // Estados NC
  const [lotes, setLotes] = useState([])
  const [detectadoPor, setDetectadoPor] = useState('')
  const itemVacio = () => ({ id: Date.now(), lote: null, busquedaLote: '', mostrarLotes: false, indiceLote: -1, defecto: '', causa: '', cantidad: '1', observaciones: '' })
  const [itemsNC, setItemsNC] = useState([itemVacio()])
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  useEffect(() => {
    fetch('/api/proyectos')
      .then(r => r.json())
      .then(data => { if (data.proyectos) setProyectos(data.proyectos) })
      .catch(e => console.error('Error cargando proyectos:', e))

    fetch('/api/empleados')
      .then(r => r.json())
      .then(data => { if (data.empleados) setEmpleados(data.empleados) })
      .catch(e => console.error('Error cargando empleados:', e))
  }, [])

  const seleccionarProyecto = (p) => {
    setProyectoSeleccionado(p)
    setBusqueda(p.nombre)
    setMostrarResultados(false)
    setEmailCliente('')
    setContactoNombre('')
    setEmailComercial('')
    fetch(`/api/contacto?proyecto_id=${p.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.email_principal) setEmailCliente(data.email_principal)
        if (data.contacto_nombre) setContactoNombre(data.contacto_nombre)
        if (data.email_comercial) setEmailComercial(data.email_comercial)
      })
      .catch(e => console.error('Error cargando contacto:', e))

    // Extraer número de proyecto del nombre (ej: "P-06663 6430 - ..." → "6430")
    const numMatch = p.nombre.match(/\b(\d{4,5})\b/)
    if (numMatch) {
      const numProyecto = numMatch[1]
      fetch(`/api/lotes?proyecto=${numProyecto}`)
        .then(r => r.json())
        .then(data => { if (data.lotes) setLotes(data.lotes) })
        .catch(e => console.error('Error cargando lotes:', e))
    }
  }

  const canSubmit = tipo !== null && (tipo !== 'nc' || resolucion !== null) && (tipo !== 'nc' || itemsNC.some(i => i.lote && i.defecto && i.causa)) && (tipo !== 'minuta' || inputText.trim().length > 5)

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
        body: JSON.stringify({
            tipo,
            resolucion,
            input: tipo === 'nc'
              ? itemsNC.filter(i => i.lote).map(i => 'Pieza: ' + i.lote.nombre + ' | Producto: ' + i.lote.producto + ' | Defecto: ' + i.defecto + ' | Causa: ' + i.causa + ' | Cantidad: ' + i.cantidad + ' | Obs: ' + i.observaciones).join(' // ') + ' | Detectado por: ' + detectadoPor
              : inputText,
            proyectos,
            proyectoForzado: proyectoSeleccionado,
            fechaMinuta: tipo === 'minuta' ? fechaMinuta : null,
            asistentesMinuta: tipo === 'minuta' ? asistentes : [],
            ncData: tipo === 'nc' ? {
              items: itemsNC.filter(i => i.lote).map(i => ({
                lote: i.lote.nombre,
                producto: i.lote.producto,
                defecto: i.defecto,
                causa: i.causa,
                cantidad: i.cantidad,
                observaciones: i.observaciones,
              })),
              detectadoPor,
              resolucion,
            } : null,
          })
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

  const abrirMail = () => {
    if (!result) return
    const asunto = result.tipo === 'minuta'
      ? (result.asunto_email || `Minuta de obra — ${result.obra || ''}`)
      : `No Conformidad — ${result.proyecto || 'MSH'}`
    const cuerpo = result.tipo === 'minuta' ? buildCuerpoMinuta(result) : buildReporteNC(result)
    const ENRIQUE_EMAIL = 'enrique@grupomsh.com.ar'
    const destinatarios = [emailCliente, emailComercial, ENRIQUE_EMAIL].filter(Boolean).join(',')
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    if (isIOS) {
      const mailtoUrl = `mailto:${destinatarios}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
      window.location.href = mailtoUrl
    } else {
      const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(destinatarios)}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
      window.open(gmailUrl, '_blank')
    }
  }


  const guardarEnOdoo = async () => {
    if (!result || !result.proyecto_id) return
    setGuardandoOdoo(true)
    try {
      // Cargar jsPDF desde CDN si no está disponible
      if (!window.jspdf) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
          script.onload = resolve
          script.onerror = reject
          document.head.appendChild(script)
        })
      }
      const { jsPDF } = window.jspdf
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      const margin = 20

      // Header — MSH en texto, sin imagen
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.setTextColor(200, 169, 110)
      doc.text('MSH', margin, 18)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text('Shaping the future of Metal', margin + 18, 18)

      doc.setDrawColor(200, 169, 110)
      doc.setLineWidth(0.5)
      doc.line(margin, 22, pageW - margin, 22)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(20, 20, 20)
      const titulo = result.tipo === 'minuta' ? 'MINUTA DE REUNIÓN DE OBRA' : 'NO CONFORMIDAD — REPORTE'
      doc.text(titulo, margin, 31)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(result.obra || result.proyecto || '', margin, 38)
      doc.text(result.fecha || new Date().toLocaleDateString('es-AR'), pageW - margin, 38, { align: 'right' })

      let y = 47

      const addSeccion = (tituloSec, items) => {
        if (!items || (Array.isArray(items) && items.length === 0)) return
        if (y > pageH - 30) { doc.addPage(); y = 20 }
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(200, 169, 110)
        doc.text(tituloSec.toUpperCase(), margin, y)
        y += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(40, 40, 40)
        const lista = Array.isArray(items) ? items : [items]
        for (const item of lista) {
          if (!item) continue
          const lineas = doc.splitTextToSize('• ' + item, pageW - margin * 2)
          for (const linea of lineas) {
            if (y > pageH - 30) { doc.addPage(); y = 20 }
            doc.text(linea, margin, y)
            y += 5
          }
        }
        y += 3
      }

      if (result.tipo === 'minuta') {
        addSeccion('Lugar', [result.lugar])
        addSeccion('Asistentes', result.asistentes)
        addSeccion('Temas tratados', result.temas)
        addSeccion('Acuerdos y decisiones', result.acuerdos)
        addSeccion('Pendientes', result.pendientes)
        addSeccion('Próxima visita', [result.proxima_visita])
      } else {
        addSeccion('Producto', [result.producto + (result.terminacion ? ' — ' + result.terminacion : '')])
        addSeccion('Sector origen', [result.sector])
        addSeccion('Causa', [result.causa])
        addSeccion('Descripción', [result.descripcion])
        addSeccion('Piezas afectadas', [result.piezas_cantidad])
        addSeccion('Contramedidas', result.contramedidas)
        addSeccion('Costo estimado', [result.costo_estimado])
        addSeccion('Clasificación', [result.clasificacion])
      }

      doc.setDrawColor(200, 169, 110)
      doc.line(margin, pageH - 15, pageW - margin, pageH - 15)
      doc.setFontSize(7)
      doc.setTextColor(150, 150, 150)
      doc.text('MSH. Shaping the future of Metal  |  +5411 5263 0413  |  info@grupomsh.com.ar  |  www.grupomsh.com.ar', pageW / 2, pageH - 9, { align: 'center' })

      const pdfBase64 = doc.output('datauristring').split(',')[1]
      const obraSlug = (result.obra || result.proyecto || 'msh').replace(/[^a-z0-9]/gi, '_')
      const fechaSlug = (result.fecha || '').replace(/\//g, '-')
      const nombreArchivo = 'minuta_' + obraSlug + '_' + fechaSlug + '.pdf'

      const res = await fetch('/api/guardar-odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proyecto_id: result.proyecto_id,
          tipo: result.tipo,
          fecha: result.fecha,
          obra: result.obra || result.proyecto,
          pdf_base64: pdfBase64,
          pdf_nombre: nombreArchivo,
        })
      })

      const data = await res.json()
      if (data.ok) {
        setGuardadoOdoo(true)
      } else {
        alert('No se pudo guardar en ODOO: ' + (data.error || 'Error desconocido'))
      }
    } catch (err) {
      console.error('Error guardando en ODOO:', err)
      alert('Error al generar el PDF o guardar en ODOO')
    } finally {
      setGuardandoOdoo(false)
    setGuardadoOdoo(false)
    }
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
    setProyectoSeleccionado(null)
    setBusqueda('')
    setMostrarResultados(false)
    setAsistentes([])
    setBusquedaAsistente('')
    setMostrarAsistentes(false)
    setFechaMinuta(new Date().toISOString().split('T')[0])
  setGuardadoOdoo(false)
  setLotes([])
  setDetectadoPor('')
  setItemsNC([{ id: Date.now(), lote: null, busquedaLote: '', mostrarLotes: false, indiceLote: -1, defecto: '', causa: '', cantidad: '1', observaciones: '' }])
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.logoWrapper}>
            <Image src="/logo.png" alt="MSH" width={72} height={36} style={{ objectFit: 'contain' }} />
          </div>
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

            {proyectos.length > 0 && (
              <div className={styles.card}>
                <p className={styles.sectionLabel}>Proyecto</p>
                {proyectoSeleccionado ? (
                  <div className={styles.proyectoSelected}>
                    <div className={styles.proyectoSelectedInfo}>
                      <span className={styles.proyectoSelectedNombre}>{proyectoSeleccionado.nombre}</span>
                      {proyectoSeleccionado.comercial && (
                        <span className={styles.proyectoSelectedComercial}>{proyectoSeleccionado.comercial}</span>
                      )}
                    </div>
                    <button
                      className={styles.proyectoSelectedClear}
                      onClick={() => { setProyectoSeleccionado(null); setBusqueda(''); }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className={styles.searchWrapper}>
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder="Buscá por nombre, cliente o comercial..."
                      value={busqueda}
                      onChange={(e) => { setBusqueda(e.target.value); setMostrarResultados(true); setIndiceProyecto(-1); }}
                      onFocus={() => setMostrarResultados(true)}
                      onBlur={() => setTimeout(() => setMostrarResultados(false), 150)}
                      onKeyDown={(e) => {
                        const palabras = busqueda.toLowerCase().split(/s+/).filter(Boolean)
                        const resultados = proyectos.filter(p => {
                          const texto = [p.nombre, p.cliente, p.comercial].join(' ').toLowerCase()
                          return palabras.every(w => texto.includes(w))
                        }).slice(0, 8)
                        if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          setIndiceProyecto(i => Math.min(i + 1, resultados.length - 1))
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault()
                          setIndiceProyecto(i => Math.max(i - 1, 0))
                        } else if (e.key === 'Enter' && indiceProyecto >= 0 && resultados[indiceProyecto]) {
                          e.preventDefault()
                          seleccionarProyecto(resultados[indiceProyecto])
                          setIndiceProyecto(-1)
                        } else if (e.key === 'Escape') {
                          setMostrarResultados(false)
                          setIndiceProyecto(-1)
                        }
                      }}
                    />
                    {!busqueda && (
                      <p className={styles.searchHint}>O dejá vacío para detección automática por audio</p>
                    )}
                    {mostrarResultados && busqueda.length >= 2 && (() => {
                      const palabras = busqueda.toLowerCase().split(/\s+/).filter(Boolean)
                      const resultados = proyectos.filter(p => {
                        const texto = [p.nombre, p.cliente, p.comercial].join(' ').toLowerCase()
                        return palabras.every(palabra => texto.includes(palabra))
                      }).slice(0, 8)
                      return resultados.length > 0 ? (
                        <div className={styles.searchResults}>
                          {resultados.map((p, idx) => (
                            <button
                              key={p.id}
                              className={styles.searchResultItem + (idx === indiceProyecto ? ' ' + styles.searchResultItemActivo : '')}
                              onMouseDown={() => seleccionarProyecto(p)}
                            >
                              <span className={styles.searchResultNombre}>{p.nombre}</span>
                              {p.comercial && <span className={styles.searchResultComercial}>{p.comercial}</span>}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.searchResults}>
                          <p className={styles.searchNoResult}>Sin coincidencias</p>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

            {tipo === 'minuta' && (
              <div className={styles.card}>
                <p className={styles.sectionLabel}>Fecha de la reunión</p>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={fechaMinuta}
                  onChange={(e) => setFechaMinuta(e.target.value)}
                />
              </div>
            )}

            {tipo === 'nc' && proyectoSeleccionado && (
              <>
                {/* Tabla de piezas */}
                <div className={styles.card}>
                  <p className={styles.sectionLabel}>Piezas afectadas</p>
                  <div className={styles.ncTabla}>
                    {/* Header */}
                    <div className={styles.ncTablaHeader}>
                      <span>Pieza / Lote</span>
                      <span>Defecto</span>
                      <span>Causa</span>
                      <span>Cant.</span>
                      <span>Observaciones</span>
                      <span></span>
                    </div>

                    {/* Cards por pieza */}
                    {itemsNC.map((item, rowIdx) => (
                      <div key={item.id} className={styles.ncTablaFila}>

                        {/* Header de fila */}
                        <div className={styles.ncFilaTop}>
                          <span className={styles.ncFilaNumero}>Pieza {rowIdx + 1}</span>
                          {itemsNC.length > 1 && (
                            <button className={styles.ncEliminarBtn} onClick={() => setItemsNC(prev => prev.filter((_, i) => i !== rowIdx))}>✕ Eliminar</button>
                          )}
                        </div>

                        {/* Selector de pieza — dropdown */}
                        <div className={styles.ncCeldaPieza}>
                          <p className={styles.ncFieldLabel}>Pieza / Lote</p>
                          <select
                            className={styles.ncSelect}
                            value={item.lote ? item.lote.id : ''}
                            onChange={(e) => {
                              const lote = lotes.find(l => l.id === parseInt(e.target.value)) || null
                              setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, lote} : it))
                            }}
                          >
                            <option value="">Seleccioná una pieza...</option>
                            {lotes.map(l => (
                              <option key={l.id} value={l.id}>{l.nombre}</option>
                            ))}
                          </select>
                        </div>

                        {/* Defecto + Causa */}
                        <div className={styles.ncFilaGrid}>
                          <div className={styles.ncCelda}>
                            <p className={styles.ncFieldLabel}>Defecto</p>
                            <select className={styles.ncSelect} value={item.defecto} onChange={(e) => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, defecto: e.target.value} : it))}>
                              <option value="">Seleccioná...</option>
                              {['Rayada', 'Golpeada', 'Mal pintada', 'Mal plegada', 'Medida incorrecta', 'Faltante', 'Color incorrecto', 'Otro'].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                          <div className={styles.ncCelda}>
                            <p className={styles.ncFieldLabel}>Causa</p>
                            <select className={styles.ncSelect} value={item.causa} onChange={(e) => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, causa: e.target.value} : it))}>
                              <option value="">Seleccioná...</option>
                              {['Planos / Doc.', 'Mano de obra', 'Máquina', 'Proveedor', 'Comunicación', 'Otra'].map(ca => <option key={ca} value={ca}>{ca}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* Cantidad + Observaciones */}
                        <div className={styles.ncFilaGridFull}>
                          <div className={styles.ncCeldaCant}>
                            <p className={styles.ncFieldLabel}>Cantidad</p>
                            <input type="number" min="1" className={styles.ncSelect} value={item.cantidad}
                              onChange={(e) => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, cantidad: e.target.value} : it))} />
                          </div>
                          <div className={styles.ncCelda} style={{gridColumn: '2 / 4'}}>
                            <p className={styles.ncFieldLabel}>Observaciones</p>
                            <input className={styles.ncSelect} placeholder="Opcional..." value={item.observaciones}
                              onChange={(e) => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, observaciones: e.target.value} : it))} />
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Agregar fila */}
                    <button className={styles.ncAgregarBtn}
                      onClick={() => setItemsNC(prev => [...prev, { id: Date.now(), lote: null, busquedaLote: '', mostrarLotes: false, indiceLote: -1, defecto: '', causa: '', cantidad: '1', observaciones: '' }])}>
                      + Agregar pieza
                    </button>
                  </div>
                </div>

                {/* Detectado por */}
                <div className={styles.card}>
                  <p className={styles.sectionLabel}>Detectado por</p>
                  <input type="text" className={styles.searchInput} placeholder="Nombre de quien detectó el problema..."
                    value={detectadoPor} onChange={(e) => setDetectadoPor(e.target.value)} />
                </div>
              </>
            )}

            {tipo === 'minuta' && (
              <div className={styles.card}>
                <p className={styles.sectionLabel}>Asistentes</p>
                {asistentes.length > 0 && (
                  <div className={styles.asistentesList}>
                    {asistentes.map((a, i) => (
                      <span key={i} className={styles.asistenteTag}>
                        {a}
                        <button onClick={() => setAsistentes(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className={styles.searchWrapper}>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Agregá asistentes de MSH o externos..."
                    value={busquedaAsistente}
                    onChange={(e) => { setBusquedaAsistente(e.target.value); setMostrarAsistentes(true); setIndiceAsistente(-1); }}
                    onFocus={() => setMostrarAsistentes(true)}
                    onBlur={() => setTimeout(() => { setMostrarAsistentes(false); setIndiceAsistente(-1); }, 150)}
                    onKeyDown={(e) => {
                      const q = busquedaAsistente.toLowerCase()
                      const sugeridos = empleados
                        .filter(em => em.nombre.toLowerCase().includes(q) && !asistentes.includes(em.nombre))
                        .slice(0, 6)
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setMostrarAsistentes(true)
                        setIndiceAsistente(i => Math.min(i + 1, sugeridos.length - 1))
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setIndiceAsistente(i => Math.max(i - 1, 0))
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        if (indiceAsistente >= 0 && sugeridos[indiceAsistente]) {
                          const nombre = sugeridos[indiceAsistente].nombre
                          if (!asistentes.includes(nombre)) setAsistentes(prev => [...prev, nombre])
                          setBusquedaAsistente('')
                          setMostrarAsistentes(false)
                          setIndiceAsistente(-1)
                        } else if (busquedaAsistente.trim()) {
                          if (!asistentes.includes(busquedaAsistente.trim())) {
                            setAsistentes(prev => [...prev, busquedaAsistente.trim()])
                          }
                          setBusquedaAsistente('')
                          setMostrarAsistentes(false)
                          setIndiceAsistente(-1)
                        }
                      } else if (e.key === 'Escape') {
                        setMostrarAsistentes(false)
                        setIndiceAsistente(-1)
                      }
                    }}
                  />
                  {mostrarAsistentes && busquedaAsistente.length >= 2 && (() => {
                    const q = busquedaAsistente.toLowerCase()
                    const sugeridos = empleados
                      .filter(e => e.nombre.toLowerCase().includes(q) && !asistentes.includes(e.nombre))
                      .slice(0, 6)
                    return (
                      <div className={styles.searchResults}>
                        {sugeridos.map((e, idx) => (
                          <button
                            key={e.id}
                            className={styles.searchResultItem + (idx === indiceAsistente ? ' ' + styles.searchResultItemActivo : '')}
                            onMouseDown={() => {
                              if (!asistentes.includes(e.nombre)) {
                                setAsistentes(prev => [...prev, e.nombre])
                              }
                              setBusquedaAsistente('')
                              setMostrarAsistentes(false)
                              setIndiceAsistente(-1)
                            }}
                          >
                            <span className={styles.searchResultNombre}>{e.nombre}</span>
                            {e.cargo && <span className={styles.searchResultComercial}>{e.cargo}</span>}
                          </button>
                        ))}
                        {busquedaAsistente.trim() && !empleados.some(e => e.nombre.toLowerCase() === busquedaAsistente.toLowerCase()) && (
                          <button
                            className={styles.searchResultItem}
                            onMouseDown={() => {
                              if (!asistentes.includes(busquedaAsistente.trim())) {
                                setAsistentes(prev => [...prev, busquedaAsistente.trim()])
                              }
                              setBusquedaAsistente('')
                              setMostrarAsistentes(false)
                            }}
                          >
                            <span className={styles.searchResultNombre}>Agregar "{busquedaAsistente.trim()}"</span>
                            <span className={styles.searchResultComercial}>Externo</span>
                          </button>
                        )}
                      </div>
                    )
                  })()}
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
                  <span className={styles.resultValue}>
                    {result.proyecto_id ? `#${result.proyecto_id} — ` : ''}{result.obra || '—'}
                  </span>
                </div>
                {result.comercial && (
                  <div className={styles.resultRow}>
                    <span className={styles.resultLabel}>Comercial</span>
                    <span className={styles.resultValue}>{result.comercial}</span>
                  </div>
                )}
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
                  <span className={styles.resultValue}>
                    {result.proyecto_id ? `#${result.proyecto_id} — ` : ''}{result.proyecto || '—'}
                  </span>
                </div>
                {result.comercial && (
                  <div className={styles.resultRow}>
                    <span className={styles.resultLabel}>Comercial</span>
                    <span className={styles.resultValue}>{result.comercial}</span>
                  </div>
                )}
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
                    ? <>
                        Destinatarios: <strong>Enrique Suárez{result.comercial ? ` · ${result.comercial}` : ' · Comercial a cargo'}</strong>
                        <div style={{ marginTop: 6, fontSize: 12 }}>
                          <span style={{ opacity: 0.6 }}>Email cliente: </span>
                          {emailCliente
                            ? <><a href={`mailto:${emailCliente}`} style={{ color: 'var(--acento, #c8a96e)', textDecoration: 'none' }}>{emailCliente}</a>
                                {contactoNombre && <span style={{ opacity: 0.5 }}> — {contactoNombre}</span>}
                              </>
                            : <span style={{ opacity: 0.4, fontStyle: 'italic' }}>No cargado en ODOO</span>
                          }
                        </div>
                      </>
                    : <>Notificar a: <strong>Responsable de operaciones · Jefe de planta{result.comercial ? ` · ${result.comercial}` : ''}</strong></>
                  }
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className={styles.copyBtn} onClick={copyText} style={{ flex: 1 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    {copied ? 'Copiado ✓' : result.tipo === 'minuta' ? 'Copiar borrador' : 'Copiar reporte'}
                  </button>
                  {result.tipo === 'minuta' && (
                    <button className={styles.copyBtn} onClick={abrirMail} style={{ flex: 1 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                      Abrir en mail
                    </button>
                  )}
                </div>
                {copied && (
                  <div className={styles.successMsg}>
                    <p>{result.tipo === 'minuta' ? 'Borrador copiado — pegalo en tu mail y revisalo antes de enviar' : 'Reporte copiado — envialo al responsable'}</p>
                  </div>
                )}
                {result.proyecto_id && (
                  <button
                    className={styles.copyBtn}
                    onClick={guardarEnOdoo}
                    disabled={guardandoOdoo || guardadoOdoo}
                    style={{ width: '100%', marginTop: 4, opacity: guardadoOdoo ? 0.6 : 1 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    {guardadoOdoo ? '✓ Guardado en ODOO' : guardandoOdoo ? 'Guardando...' : 'Guardar en ODOO'}
                  </button>
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
