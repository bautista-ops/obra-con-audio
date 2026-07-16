'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import styles from './page.module.css'

const itemVacio = () => ({ id: Date.now(), lote: null, busquedaLote: '', mostrarLotes: false, indiceLote: -1, textoLibre: '', modoTexto: false, defecto: '', causa: '', cantidad: '1', observaciones: '', imagenes: [] })

// Origen → quality.reason IDs en Odoo (confirmados)
const ORIGENES_NC = [
  { reasonId: 6, label: 'Planta — Fabricación', depts: ['PLANTA'] },
  { reasonId: 1, label: 'Planta — Falla de máquina', depts: ['PLANTA', 'MANTENIMIENTO'] },
  { reasonId: 5, label: 'Oficina Técnica', depts: ['OFICINA TECNICA', 'INGENIERIA E INSTALACIONES'] },
  { reasonId: 9, label: 'Logística', depts: ['PLANTA', 'COORDINACION PROYECTO y PLANIFICACION'] },
  { reasonId: 7, label: 'Proveedor', depts: null },
  { reasonId: 8, label: 'Comunicación', depts: null },
  { reasonId: 4, label: 'Otros', depts: null },
]

export default function Home() {
  const [step, setStep] = useState('input') // input | loading | result
  const [tipo, setTipo] = useState(null)
  const [resolucion, setResolucion] = useState(null)
  const [fotosMinuta, setFotosMinuta] = useState([])
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
  const [editando, setEditando] = useState(false)
  const [gravedadNC, setGravedadNC] = useState('')
  const [urgenciaNC, setUrgenciaNC] = useState('')
  const [guardadoOdoo, setGuardadoOdoo] = useState(false)
  const [driveInfo, setDriveInfo] = useState(null) // { ok, fileName, folderUrl, error }
  const [destino, setDestino] = useState(null)
  const [indiceAsistente, setIndiceAsistente] = useState(-1)
  // Estados NC
  const [lotes, setLotes] = useState([])
  const [numObra, setNumObra] = useState('')
  const [buscandoLotes, setBuscandoLotes] = useState(false)
  const [detectadoPor, setDetectadoPor] = useState('')
  const [departamentoNC, setDepartamentoNC] = useState('')
  const [origenNC, setOrigenNC] = useState(null) // reasonId de quality.reason
  const [respTipo, setRespTipo] = useState(null) // 'empleado' | 'externo' | 'a_determinar'
  const [respEmpleado, setRespEmpleado] = useState(null) // objeto {id, nombre, departamento}
  const [respExterno, setRespExterno] = useState('')
  const [busquedaResp, setBusquedaResp] = useState('')
  const [mostrarEmpleados, setMostrarEmpleados] = useState(false)
  const [verTodosEmp, setVerTodosEmp] = useState(false)
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

  const buscarLotesPorNumero = async (num) => {
    if (!num || num.length < 3) return
    setBuscandoLotes(true)
    try {
      const res = await fetch(`/api/lotes?proyecto=${num}`)
      const data = await res.json()
      if (data.lotes) setLotes(data.lotes)
    } catch (e) {
      console.error('Error buscando lotes:', e)
    } finally {
      setBuscandoLotes(false)
    }
  }

  const recargarProyectos = () => {
    fetch('/api/proyectos')
      .then(r => r.json())
      .then(data => { if (data.proyectos) setProyectos(data.proyectos) })
      .catch(e => console.error('Error recargando proyectos:', e))
  }

  const seleccionarProyecto = (p) => {
    setProyectoSeleccionado(p)
    setBusqueda(p.nombre)
    setMostrarResultados(false)
    setEmailCliente('')
    setContactoNombre('')
    setEmailComercial('')
    setLotes([])
    setNumObra('')
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

  const origenSelObj = ORIGENES_NC.find(o => o.reasonId === origenNC) || null
  const respValido = respTipo === 'a_determinar' || (respTipo === 'empleado' && respEmpleado) || (respTipo === 'externo' && respExterno.trim())
  const canSubmit = tipo !== null && (tipo !== 'nc' || (resolucion !== null && origenNC !== null && respValido && itemsNC.some(i => i.defecto))) && (tipo !== 'minuta' || inputText.trim().length > 5)

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
              ? itemsNC.filter(i => i.defecto).map(i => {
                  const piezaStr = i.lote ? ('Pieza: ' + i.lote.nombre + ' | Producto: ' + i.lote.producto) : (i.textoLibre ? 'Pieza (texto libre): ' + i.textoLibre : 'Sin pieza')
                  return piezaStr + ' | Defecto: ' + i.defecto + ' | Causa: ' + i.causa + ' | Cantidad: ' + i.cantidad + ' | Obs: ' + i.observaciones
                }).join(' // ') + ' | Detectado por: ' + (respEmpleado?.nombre || respExterno || 'A determinar')
              : inputText,
            proyectos,
            proyectoForzado: proyectoSeleccionado,
            fechaMinuta: tipo === 'minuta' ? fechaMinuta : null,
            asistentesMinuta: tipo === 'minuta' ? asistentes.map(nombre => {
              const emp = empleados.find(e => e.nombre === nombre)
              return emp?.cargo ? `${nombre} — ${emp.cargo}` : nombre
            }) : [],
            ncData: tipo === 'nc' ? {
              items: itemsNC.filter(i => i.defecto).map(i => ({
                lote: i.lote?.nombre || i.textoLibre || null,
                lote_id: i.lote?.id || null,
                producto: i.lote?.producto || null,
                textoLibre: (!i.lote && i.textoLibre) ? i.textoLibre : null,
                piezaNoCatalogada: !i.lote && !!i.textoLibre,
                defecto: i.defecto,
                causa: i.causa,
                cantidad: i.cantidad,
                observaciones: i.observaciones,
                imagenes: i.imagenes || [],
              })),
              detectadoPor: respEmpleado?.nombre || respExterno || 'A determinar',
              departamento: origenSelObj?.label || departamentoNC,
              origenReasonId: origenNC,
              responsableEmpleadoId: respTipo === 'empleado' && respEmpleado ? respEmpleado.id : null,
              responsableExterno: respTipo === 'externo' && respExterno.trim() ? respExterno.trim() : null,
              gravedad: gravedadNC,
              urgencia: urgenciaNC,
              resolucion,
            } : null,
          })
      })
      const data = await res.json()
      clearInterval(interval)
      if (!res.ok) throw new Error(data.error || 'Error del servidor')
      // Guardar ncData en el result para usarlo al guardar en ODOO
      if (data.tipo === 'nc') {
        data._ncData = {
          proyecto: data.proyecto || proyectoSeleccionado?.nombre || '',
          items: itemsNC.filter(i => i.defecto).map(i => ({
            lote: i.lote?.nombre || i.textoLibre || null,
            lote_id: i.lote?.id || null,
            producto: i.lote?.producto || null,
            textoLibre: (!i.lote && i.textoLibre) ? i.textoLibre : null,
            piezaNoCatalogada: !i.lote && !!i.textoLibre,
            defecto: i.defecto,
            causa: i.causa,
            cantidad: i.cantidad,
            observaciones: i.observaciones,
            imagenes: i.imagenes || [],
          })),
          detectadoPor: respEmpleado?.nombre || respExterno || 'A determinar',
          departamento: origenSelObj?.label || departamentoNC,
          origenReasonId: origenNC,
          responsableEmpleadoId: respTipo === 'empleado' && respEmpleado ? respEmpleado.id : null,
          responsableExterno: respTipo === 'externo' && respExterno.trim() ? respExterno.trim() : null,
          gravedad: gravedadNC,
          urgencia: urgenciaNC,
          resolucion: resolucion === 'refab' ? 'Requiere refabricación' : 'Se resuelve en obra',
        }
      }
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
    const NC_REFAB_EMAILS = ['enrique@grupomsh.com.ar', 'joaquin@grupomsh.com.ar', 'eric@grupomsh.com.ar']

    // Agregar emails de asistentes MSH seleccionados
    // asistentes puede tener "Nombre — Cargo", extraer solo el nombre para buscar
    const emailsAsistentes = asistentes
      .map(entrada => {
        const nombre = entrada.split(' — ')[0].trim()
        return empleados.find(e => e.nombre === nombre)
      })
      .filter(e => e && e.email && e.email !== ENRIQUE_EMAIL)
      .map(e => e.email)

    const destinatarios = result.tipo === 'nc' && result.resolucion?.includes('refabricación')
      ? [emailComercial, ...NC_REFAB_EMAILS].filter(Boolean).join(',')
      : [emailComercial, ENRIQUE_EMAIL, ...emailsAsistentes].filter(Boolean).join(',')

    // Si hay fotos en NC, descargarlas antes de abrir el mail
    if (result.tipo === 'nc') {
      const todasLasImagenes = itemsNC.flatMap((item, rowIdx) =>
        ((item.imagenes || [])).map((img, imgIdx) => ({
          base64: img.base64,
          nombre: `NC_${item.lote?.nombre?.replace(/[^a-z0-9]/gi, '_') || 'pieza' + (rowIdx + 1)}_foto${imgIdx + 1}.jpg`
        }))
      )
      if (todasLasImagenes.length > 0) {
        todasLasImagenes.forEach(img => {
          const link = document.createElement('a')
          link.href = `data:image/jpeg;base64,${img.base64}`
          link.download = img.nombre
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        })
        alert(`Se descargaron ${todasLasImagenes.length} foto${todasLasImagenes.length > 1 ? 's' : ''} — adjuntalas al mail antes de enviar.`)
      }
    }

    const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(destinatarios)}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
    window.open(gmailUrl, '_blank')
  }


  const comprimirImagen = (file) => new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX = 1200
        let w = img.width, h = img.height
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
        if (h > MAX) { w = Math.round(w * MAX / h); h = MAX }
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
        resolve({ base64, nombre: file.name, tipo: 'image/jpeg' })
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })

  const descargarPDF = async () => {
    try {
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

      // Cargar BC Liguria y logo
      let logoB64 = null
      try {
        const [fontRes, logoRes] = await Promise.all([
          fetch('/BCLiguria-Regular-b64.txt'),
          fetch('/logo-pdf-b64.txt'),
        ])
        const fontB64 = await fontRes.text()
        doc.addFileToVFS('BCLiguria-Regular.ttf', fontB64)
        doc.addFont('BCLiguria-Regular.ttf', 'BCLiguria', 'normal')
        doc.addFont('BCLiguria-Regular.ttf', 'BCLiguria', 'bold')
        logoB64 = await logoRes.text()
      } catch(e) { console.warn('Assets no disponibles, usando defaults') }

      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      const margin = 20
      const fontName = doc.getFontList()['BCLiguria'] ? 'BCLiguria' : 'helvetica'

      // Logo MSH en texto BC Liguria
      doc.setFont(fontName, 'bold')
      doc.setFontSize(22)
      doc.setTextColor(20, 20, 20)
      doc.text('MSH', margin, 18)
      doc.setFont(fontName, 'normal')
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text('Shaping the future of Metal', margin + 20, 18)
      doc.setDrawColor(200, 169, 110)
      doc.setLineWidth(0.5)
      doc.line(margin, 22, pageW - margin, 22)

      doc.setFont(fontName, 'bold')
      doc.setFontSize(13)
      doc.setTextColor(20, 20, 20)
      doc.text(result.tipo === 'minuta' ? 'MINUTA DE REUNIÓN DE OBRA' : 'NO CONFORMIDAD — REPORTE', margin, 31)
      doc.setFont(fontName, 'normal')
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(result.obra || result.proyecto || '', margin, 38)
      doc.text(result.fecha || new Date().toLocaleDateString('es-AR'), pageW - margin, 38, { align: 'right' })

      let y = 47
      const addSeccion = (tituloSec, items) => {
        if (!items || (Array.isArray(items) && items.length === 0)) return
        if (y > pageH - 30) { doc.addPage(); y = 20 }
        doc.setFont(fontName, 'bold'); doc.setFontSize(9); doc.setTextColor(200, 169, 110)
        doc.text(tituloSec.toUpperCase(), margin, y); y += 5
        doc.setFont(fontName, 'normal'); doc.setFontSize(9); doc.setTextColor(40, 40, 40)
        const lista = Array.isArray(items) ? items : [items]
        for (const item of lista) {
          if (!item) continue
          const lineas = doc.splitTextToSize('• ' + item, pageW - margin * 2)
          for (const linea of lineas) {
            if (y > pageH - 30) { doc.addPage(); y = 20 }
            doc.text(linea, margin, y); y += 5
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
        // Fotos de minuta en PDF descarga
        if (fotosMinuta && fotosMinuta.length > 0) {
          if (y > pageH - 60) { doc.addPage(); y = 20 }
          doc.setFont(fontName, 'bold'); doc.setFontSize(9); doc.setTextColor(200, 169, 110)
          doc.text('FOTOS DE LA REUNIÓN', margin, y); y += 6
          const fW = 55; const fH = 40; const gap = 5; let xF = margin
          for (const foto of fotosMinuta) {
            const b64 = foto.base64 || (typeof foto === 'string' && foto.startsWith('data:') ? foto.split(',')[1] : foto)
            if (!b64) continue
            if (xF + fW > pageW - margin) { xF = margin; y += fH + gap }
            if (y + fH > pageH - 20) { doc.addPage(); y = 20; xF = margin }
            try { doc.addImage('data:image/jpeg;base64,' + b64, 'JPEG', xF, y, fW, fH) } catch(e) {}
            xF += fW + gap
          }
          y += fH + 8
        }
      } else {
        addSeccion('Producto', [result.producto])
        addSeccion('Sector origen', [result.sector])
        addSeccion('Causa', [result.causa])
        addSeccion('Descripción', [result.descripcion])
        addSeccion('Piezas afectadas', [result.piezas_cantidad])
        addSeccion('Contramedidas', result.contramedidas)
        addSeccion('Costo estimado', [result.costo_estimado])
      }

      doc.setDrawColor(200, 169, 110)
      doc.line(margin, pageH - 15, pageW - margin, pageH - 15)
      doc.setFontSize(7); doc.setTextColor(150, 150, 150)
      doc.text('MSH. Shaping the future of Metal  |  +5411 5263 0413  |  info@grupomsh.com.ar  |  www.grupomsh.com.ar', pageW / 2, pageH - 9, { align: 'center' })

      const obraSlug = (result.obra || result.proyecto || 'msh').replace(/[^a-z0-9]/gi, '_')
      const fechaSlug = (result.fecha || '').replace(/\//g, '-')
      doc.save(`${result.tipo === 'minuta' ? 'minuta' : 'nc'}_${obraSlug}_${fechaSlug}.pdf`)
    } catch (err) {
      console.error('Error descargando PDF:', err)
      alert('Error al generar el PDF')
    }
  }

  const guardarEnOdoo = async (destinoElegido) => {
    if (!result || !result.proyecto_id) return
    setDestino(destinoElegido)
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

      // Cargar BC Liguria y logo
      let logoB64 = null
      try {
        const [fontRes, logoRes] = await Promise.all([
          fetch('/BCLiguria-Regular-b64.txt'),
          fetch('/logo-pdf-b64.txt'),
        ])
        const fontB64 = await fontRes.text()
        doc.addFileToVFS('BCLiguria-Regular.ttf', fontB64)
        doc.addFont('BCLiguria-Regular.ttf', 'BCLiguria', 'normal')
        doc.addFont('BCLiguria-Regular.ttf', 'BCLiguria', 'bold')
        logoB64 = await logoRes.text()
      } catch(e) { console.warn('Assets no disponibles, usando defaults') }

      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      const margin = 20
      const fontName = doc.getFontList()['BCLiguria'] ? 'BCLiguria' : 'helvetica'

      // Header — MSH en texto, sin imagen
      // Logo MSH en texto BC Liguria
      doc.setFont(fontName, 'bold')
      doc.setFontSize(22)
      doc.setTextColor(20, 20, 20)
      doc.text('MSH', margin, 18)
      doc.setFont(fontName, 'normal')
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text('Shaping the future of Metal', margin + 20, 18)

      doc.setDrawColor(200, 169, 110)
      doc.setLineWidth(0.5)
      doc.line(margin, 22, pageW - margin, 22)

      doc.setFont(fontName, 'bold')
      doc.setFontSize(13)
      doc.setTextColor(20, 20, 20)
      const titulo = result.tipo === 'minuta' ? 'MINUTA DE REUNIÓN DE OBRA' : 'NO CONFORMIDAD — REPORTE'
      doc.text(titulo, margin, 31)

      doc.setFont(fontName, 'normal')
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(result.obra || result.proyecto || '', margin, 38)
      doc.text(result.fecha || new Date().toLocaleDateString('es-AR'), pageW - margin, 38, { align: 'right' })

      let y = 47

      const addSeccion = (tituloSec, items) => {
        if (!items || (Array.isArray(items) && items.length === 0)) return
        if (y > pageH - 30) { doc.addPage(); y = 20 }
        doc.setFont(fontName, 'bold')
        doc.setFontSize(9)
        doc.setTextColor(200, 169, 110)
        doc.text(tituloSec.toUpperCase(), margin, y)
        y += 5
        doc.setFont(fontName, 'normal')
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
        // Fotos de minuta en PDF guardar
        if (fotosMinuta && fotosMinuta.length > 0) {
          if (y > pageH - 60) { doc.addPage(); y = 20 }
          doc.setFont(fontName, 'bold'); doc.setFontSize(9); doc.setTextColor(200, 169, 110)
          doc.text('FOTOS DE LA REUNIÓN', margin, y); y += 6
          const fW = 55; const fH = 40; const gap = 5; let xF = margin
          for (const foto of fotosMinuta) {
            const b64 = foto.base64 || (typeof foto === 'string' && foto.startsWith('data:') ? foto.split(',')[1] : foto)
            if (!b64) continue
            if (xF + fW > pageW - margin) { xF = margin; y += fH + gap }
            if (y + fH > pageH - 20) { doc.addPage(); y = 20; xF = margin }
            try { doc.addImage('data:image/jpeg;base64,' + b64, 'JPEG', xF, y, fW, fH) } catch(e) {}
            xF += fW + gap
          }
          y += fH + 8
        }
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
          destino: destinoElegido,
          ncData: result._ncData || null,
          fotosMinuta: tipo === 'minuta' ? fotosMinuta : [],
        })
      })

      const data = await res.json()
      if (data.ok) {
        setGuardadoOdoo(true)
        if (data.drive) setDriveInfo(data.drive)
        if (data.drive?.ok) {
          console.log('Minuta subida a Drive:', data.drive.fileName)
        } else if (data.drive?.error) {
          console.warn('Drive falló (minuta guardada en ODOO igual):', data.drive.error)
        }
      } else {
        alert('No se pudo guardar en ODOO: ' + (data.error || 'Error desconocido'))
      }
    } catch (err) {
      console.error('Error guardando en ODOO:', err)
      alert('Error al generar el PDF o guardar en ODOO')
    } finally {
      setGuardandoOdoo(false)
    setGuardadoOdoo(false)
  setDestino(null)
  setEditando(false)
  setGravedadNC('')
  setUrgenciaNC('')
    }
  }

  const copyText = () => {
    if (!result) return
    const text = result.tipo === 'minuta' ? buildCuerpoMinuta(result) : buildReporteNC(result)
    navigator.clipboard.writeText(text).then(() => setCopied(true))
  }

  const [showConfirmReset, setShowConfirmReset] = useState(false)

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
  setDriveInfo(null)
  setLotes([])
  setNumObra('')
  setBuscandoLotes(false)
  setDetectadoPor('')
  setDepartamentoNC('')
  setOrigenNC(null)
  setRespTipo(null)
  setRespEmpleado(null)
  setRespExterno('')
  setBusquedaResp('')
  setVerTodosEmp(false)
  setItemsNC([itemVacio()])
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
                      onFocus={() => { setMostrarResultados(true); recargarProyectos() }}
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
                {/* Número de obra manual si no hay lotes */}
                {lotes.length === 0 && (
                  <div className={styles.card}>
                    <p className={styles.sectionLabel}>Número de obra</p>
                    <p style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>
                      No encontramos piezas automáticamente. Ingresá el número de obra para buscarlas.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className={styles.searchInput}
                        style={{ flex: 1 }}
                        placeholder="Ej: 5237"
                        value={numObra}
                        onChange={(e) => setNumObra(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') buscarLotesPorNumero(numObra) }}
                      />
                      <button
                        className={styles.ncAgregarBtn}
                        style={{ border: '1px solid #c8a96e', borderRadius: 8, padding: '0 16px', whiteSpace: 'nowrap' }}
                        onClick={() => buscarLotesPorNumero(numObra)}
                        disabled={buscandoLotes}
                      >
                        {buscandoLotes ? 'Buscando...' : 'Buscar piezas'}
                      </button>
                    </div>
                    {numObra && lotes.length === 0 && !buscandoLotes && (
                      <p style={{ fontSize: 12, color: '#c0392b', marginTop: 6 }}>Sin resultados para "{numObra}"</p>
                    )}
                  </div>
                )}

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

                        {/* Buscador de pieza — OPCIONAL */}
                        <div className={styles.ncCeldaPieza}>
                          <p className={styles.ncFieldLabel}>Pieza / Lote <span style={{fontWeight:'normal',color:'#999',fontSize:11}}>(opcional)</span></p>
                          {item.lote ? (
                            <div className={styles.ncLoteSelected}>
                              <span className={styles.ncLoteNombre}>{item.lote.nombre}</span>
                              <button onClick={() => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, lote: null, busquedaLote: '', modoTexto: false, textoLibre: ''} : it))}>✕</button>
                            </div>
                          ) : item.modoTexto ? (
                            <div>
                              <input
                                className={styles.searchInput}
                                placeholder="Describí la pieza (ej: perfil L 30x30 anodizado)..."
                                value={item.textoLibre}
                                onChange={(e) => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, textoLibre: e.target.value} : it))}
                              />
                              {item.textoLibre && (
                                <p style={{fontSize:11, color:'#e67e22', marginTop:4}}>⚠ Pieza no catalogada — irá al backlog de altas</p>
                              )}
                              <button
                                className={styles.ncEliminarBtn}
                                style={{marginTop:4}}
                                onClick={() => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, modoTexto: false, textoLibre: '', busquedaLote: ''} : it))}
                              >
                                ← Volver al buscador
                              </button>
                            </div>
                          ) : (
                            <div className={styles.searchWrapper} style={{position:'relative'}}>
                              <input
                                className={styles.searchInput}
                                placeholder="Buscá por nombre de pieza..."
                                value={item.busquedaLote}
                                onChange={(e) => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, busquedaLote: e.target.value, mostrarLotes: true, indiceLote: -1} : it))}
                                onFocus={() => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, mostrarLotes: true} : it))}
                                onBlur={() => setTimeout(() => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, mostrarLotes: false, indiceLote: -1} : it)), 150)}
                                onKeyDown={(e) => {
                                  const q = item.busquedaLote.toLowerCase()
                                  const filtrados = lotes.filter(l => l.nombre.toLowerCase().includes(q) || l.producto.toLowerCase().includes(q)).slice(0, 8)
                                  if (e.key === 'ArrowDown') { e.preventDefault(); setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, indiceLote: Math.min(it.indiceLote + 1, filtrados.length - 1)} : it)) }
                                  else if (e.key === 'ArrowUp') { e.preventDefault(); setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, indiceLote: Math.max(it.indiceLote - 1, 0)} : it)) }
                                  else if (e.key === 'Enter' && item.indiceLote >= 0 && filtrados[item.indiceLote]) {
                                    e.preventDefault()
                                    setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, lote: filtrados[item.indiceLote], busquedaLote: '', mostrarLotes: false, indiceLote: -1} : it))
                                  } else if (e.key === 'Escape') { setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, mostrarLotes: false} : it)) }
                                }}
                              />
                              {item.mostrarLotes && (() => {
                                const q = item.busquedaLote.toLowerCase()
                                const filtrados = q.length >= 1
                                  ? lotes.filter(l => l.nombre.toLowerCase().includes(q) || l.producto.toLowerCase().includes(q)).slice(0, 8)
                                  : lotes.slice(0, 8)
                                return filtrados.length > 0 ? (
                                  <div className={styles.searchResults}>
                                    {filtrados.map((l, idx) => (
                                      <button key={l.id}
                                        className={styles.searchResultItem + (idx === item.indiceLote ? ' ' + styles.searchResultItemActivo : '')}
                                        onMouseDown={() => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, lote: l, busquedaLote: '', mostrarLotes: false, indiceLote: -1} : it))}
                                      >
                                        <span className={styles.searchResultNombre}>{l.nombre}</span>
                                        {l.producto && <span className={styles.searchResultComercial}>{l.producto}</span>}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <div className={styles.searchResults}>
                                    <p className={styles.searchNoResult}>Sin coincidencias</p>
                                    <button
                                      className={styles.searchResultItem}
                                      style={{color:'#e67e22', borderTop:'1px solid #333'}}
                                      onMouseDown={() => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, modoTexto: true, mostrarLotes: false, textoLibre: it.busquedaLote, busquedaLote: ''} : it))}
                                    >
                                      ✏️ Cargar como texto libre
                                    </button>
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>

                        {/* Defecto + Causa */}
                        <div className={styles.ncFilaGrid}>
                          <div className={styles.ncCelda}>
                            <p className={styles.ncFieldLabel}>Defecto</p>
                            <select className={styles.ncSelect} value={item.defecto} onChange={(e) => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, defecto: e.target.value} : it))}>
                              <option value="">Seleccioná...</option>
                              {['Rayada', 'Golpeada', 'Pintado', 'Plegado', 'Medida incorrecta', 'Faltante', 'Color incorrecto', 'Soldadura', 'Diseño', 'Mecanizado', 'Documentación', 'Otro'].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                          <div className={styles.ncCelda}>
                            <p className={styles.ncFieldLabel}>Causa</p>
                            <select className={styles.ncSelect} value={item.causa} onChange={(e) => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, causa: e.target.value} : it))}>
                              <option value="">Seleccioná...</option>
                              {['Planos / Doc.', 'Fabricación', 'Máquina', 'Proveedor', 'Comunicación', 'Logística', 'Otra'].map(ca => <option key={ca} value={ca}>{ca}</option>)}
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

                        {/* Adjuntar fotos */}
                        <div>
                          <p className={styles.ncFieldLabel}>Fotos</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <label className={styles.ncAgregarBtn} style={{ cursor: 'pointer', margin: 0 }}>
                              📎 {((item.imagenes || [])).length > 0 ? `${((item.imagenes || [])).length} foto${((item.imagenes || [])).length > 1 ? 's' : ''} adjunta${((item.imagenes || [])).length > 1 ? 's' : ''}` : 'Adjuntar foto'}
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                  const archivos = Array.from(e.target.files)
                                  const comprimidas = await Promise.all(archivos.map(comprimirImagen))
                                  setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, imagenes: [...(it.imagenes || []), ...comprimidas]} : it))
                                  e.target.value = ''
                                }}
                              />
                            </label>
                            {((item.imagenes || [])).length > 0 && (
                              <button
                                className={styles.ncEliminarBtn}
                                onClick={() => setItemsNC(prev => prev.map((it, i) => i === rowIdx ? {...it, imagenes: []} : it))}
                              >
                                ✕ Quitar fotos
                              </button>
                            )}
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

                {/* Origen del problema — OBLIGATORIO */}
                <div className={styles.card}>
                  <p className={styles.sectionLabel}>Origen del problema <span style={{color:'#c0392b',fontSize:11}}>*</span></p>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6}}>
                    {ORIGENES_NC.map(o => (
                      <button key={o.reasonId}
                        className={`${styles.resolveOpt} ${origenNC === o.reasonId ? styles.selected : ''}`}
                        onClick={() => {
                          setOrigenNC(o.reasonId)
                          // Si el empleado elegido no matchea el depto del nuevo origen, limpiar
                          if (respEmpleado && o.depts && !o.depts.includes(respEmpleado.departamento)) {
                            setRespEmpleado(null)
                          }
                          setVerTodosEmp(false)
                        }}
                        style={{textAlign:'left', padding:'8px 12px'}}
                      >
                        <span className={styles.resolveLabel} style={{fontSize:13}}>{o.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Responsable — OBLIGATORIO con 3 salidas */}
                <div className={styles.card}>
                  <p className={styles.sectionLabel}>Responsable <span style={{color:'#c0392b',fontSize:11}}>*</span></p>
                  <div style={{display:'flex', gap:6, marginBottom:10}}>
                    {[['empleado','Empleado MSH'],['externo','Externo / Otro'],['a_determinar','A determinar']].map(([val, lbl]) => (
                      <button key={val}
                        className={`${styles.resolveOpt} ${respTipo === val ? styles.selected : ''}`}
                        onClick={() => setRespTipo(val)}
                        style={{flex:1, textAlign:'center', padding:'8px 6px'}}
                      >
                        <span className={styles.resolveLabel} style={{fontSize:12}}>{lbl}</span>
                      </button>
                    ))}
                  </div>

                  {respTipo === 'empleado' && (
                    <div>
                      {respEmpleado ? (
                        <div className={styles.ncLoteSelected}>
                          <span className={styles.ncLoteNombre}>{respEmpleado.nombre} <span style={{color:'#999',fontSize:11}}>· {respEmpleado.departamento || respEmpleado.cargo}</span></span>
                          <button onClick={() => setRespEmpleado(null)}>✕</button>
                        </div>
                      ) : (
                        <div className={styles.searchWrapper} style={{position:'relative'}}>
                          <input
                            className={styles.searchInput}
                            placeholder={origenSelObj?.depts && !verTodosEmp ? `Buscar en ${origenSelObj.label}...` : 'Buscar empleado...'}
                            value={busquedaResp}
                            onChange={(e) => { setBusquedaResp(e.target.value); setMostrarEmpleados(true) }}
                            onFocus={() => setMostrarEmpleados(true)}
                            onBlur={() => setTimeout(() => setMostrarEmpleados(false), 150)}
                          />
                          {origenSelObj?.depts && (
                            <button
                              onClick={() => setVerTodosEmp(v => !v)}
                              style={{fontSize:11, color:'#aaa', textDecoration:'underline', background:'none', border:'none', cursor:'pointer', marginTop:4, display:'block'}}
                            >
                              {verTodosEmp ? '← Filtrar por origen' : 'Mostrar todos los empleados'}
                            </button>
                          )}
                          {mostrarEmpleados && (() => {
                            let base = empleados
                            if (!verTodosEmp && origenSelObj?.depts) {
                              base = base.filter(e => origenSelObj.depts.includes(e.departamento))
                            }
                            const q = busquedaResp.toLowerCase()
                            const filtrados = q ? base.filter(e => e.nombre.toLowerCase().includes(q)) : base
                            return filtrados.length > 0 ? (
                              <div className={styles.searchResults}>
                                {filtrados.slice(0,10).map(e => (
                                  <button key={e.id}
                                    className={styles.searchResultItem}
                                    onMouseDown={() => { setRespEmpleado(e); setBusquedaResp(''); setMostrarEmpleados(false) }}
                                  >
                                    <span className={styles.searchResultNombre}>{e.nombre}</span>
                                    <span className={styles.searchResultComercial}>{e.departamento || e.cargo}</span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className={styles.searchResults}>
                                <p className={styles.searchNoResult}>Sin coincidencias</p>
                                {!verTodosEmp && origenSelObj?.depts && (
                                  <button className={styles.searchResultItem} style={{color:'#c8a96e'}}
                                    onMouseDown={() => setVerTodosEmp(true)}>
                                    Buscar en todos los empleados
                                  </button>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  {respTipo === 'externo' && (
                    <input className={styles.searchInput}
                      placeholder="Nombre del tercero / proveedor / cliente..."
                      value={respExterno}
                      onChange={(e) => setRespExterno(e.target.value)} />
                  )}

                  {respTipo === 'a_determinar' && (
                    <p style={{fontSize:12, color:'#999'}}>Se registra sin responsable — se asigna después.</p>
                  )}
                </div>

                {/* Gravedad y Urgencia */}
                <div className={styles.card}>
                  <p className={styles.sectionLabel}>Clasificación</p>
                  <div className={styles.ncFilaGrid}>
                    <div className={styles.ncCelda}>
                      <p className={styles.ncFieldLabel}>Gravedad</p>
                      <select className={styles.ncSelect} value={gravedadNC} onChange={(e) => setGravedadNC(e.target.value)}>
                        <option value="">Seleccioná...</option>
                        {['Alta', 'Media', 'Baja'].map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div className={styles.ncCelda}>
                      <p className={styles.ncFieldLabel}>Urgencia</p>
                      <select className={styles.ncSelect} value={urgenciaNC} onChange={(e) => setUrgenciaNC(e.target.value)}>
                        <option value="">Seleccioná...</option>
                        {['Alta', 'Media', 'Baja'].map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
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

            {tipo === 'minuta' && (
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
                  placeholder="Ej: Reunión en obra Kerschen hoy. Estuvieron Enrique y Rodrigo del estudio. Se definió que los tubos no llevarán tapa. Quedó pendiente el plano de la garita..."
                  rows={6}
                />

                {/* Fotos de minuta */}
                <div style={{ marginTop: 12 }}>
                  <p className={styles.sectionLabel}>Fotos de la reunión <span style={{ fontWeight: 400, opacity: 0.5 }}>(opcional)</span></p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {fotosMinuta.map((f, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={`data:image/jpeg;base64,${f.base64}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--borde, #e0ddd8)' }} alt="" />
                        <button onClick={() => setFotosMinuta(prev => prev.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#c0392b', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      </div>
                    ))}
                    <label style={{ width: 72, height: 72, border: '2px dashed var(--borde, #e0ddd8)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--acento, #c8a96e)', fontSize: 22, background: 'var(--fondo, #fafaf9)' }}>
                      +
                      <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                        onChange={async (e) => {
                          const files = Array.from(e.target.files)
                          const compressed = await Promise.all(files.map(comprimirImagen))
                          setFotosMinuta(prev => [...prev, ...compressed])
                          e.target.value = ''
                        }} />
                    </label>
                  </div>
                </div>
              </div>
            )}

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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className={styles.badgeMinuta}>Minuta de obra</span>
                  <button
                    onClick={() => setEditando(e => !e)}
                    style={{ fontSize: 12, background: 'none', border: '1px solid #e0ddd8', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: editando ? '#c8a96e' : '#888' }}
                  >
                    {editando ? '✓ Guardar cambios' : '✏️ Editar'}
                  </button>
                </div>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Obra</span>
                  <span className={styles.resultValue}>{result.proyecto_id ? `#${result.proyecto_id} — ` : ''}{result.obra || '—'}</span>
                </div>
                {result.comercial && (
                  <div className={styles.resultRow}>
                    <span className={styles.resultLabel}>Comercial</span>
                    <span className={styles.resultValue}>{result.comercial}</span>
                  </div>
                )}
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Fecha</span>
                  {editando
                    ? <input className={styles.ncSelect} type="date" value={result.fecha ? result.fecha.split('/').reverse().join('-') : ''} onChange={e => { const [y,m,d] = e.target.value.split('-'); setResult(r => ({...r, fecha: `${d}/${m}/${y}`})) }} style={{ flex: 1 }} />
                    : <span className={styles.resultValue}>{result.fecha || '—'}</span>
                  }
                </div>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Asistentes</span>
                  <span className={styles.resultValue}>{(result.asistentes || []).join(', ') || '—'}</span>
                </div>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Asunto del mail</span>
                  {editando
                    ? <input className={styles.ncSelect} value={result.asunto_email || ''} onChange={e => setResult(r => ({...r, asunto_email: e.target.value}))} style={{ flex: 1 }} />
                    : <span className={styles.resultValue}>{result.asunto_email || '—'}</span>
                  }
                </div>
                <div className={styles.resultRow} style={{ flexDirection: 'column', gap: 6 }}>
                  <span className={styles.resultLabel}>Temas tratados</span>
                  {editando
                    ? <textarea className={styles.ncSelect} rows={4} value={(result.temas || []).join('\n')} onChange={e => setResult(r => ({...r, temas: e.target.value.split('\n')}))} style={{ width: '100%', resize: 'vertical' }} />
                    : <pre className={styles.resultBody}>{(result.temas || []).map(t => `• ${t}`).join('\n')}</pre>
                  }
                </div>
                <div className={styles.resultRow} style={{ flexDirection: 'column', gap: 6 }}>
                  <span className={styles.resultLabel}>Acuerdos</span>
                  {editando
                    ? <textarea className={styles.ncSelect} rows={3} value={(result.acuerdos || []).join('\n')} onChange={e => setResult(r => ({...r, acuerdos: e.target.value.split('\n')}))} style={{ width: '100%', resize: 'vertical' }} />
                    : <pre className={styles.resultBody}>{(result.acuerdos || []).map(a => `• ${a}`).join('\n')}</pre>
                  }
                </div>
                <div className={styles.resultRow} style={{ flexDirection: 'column', gap: 6 }}>
                  <span className={styles.resultLabel}>Pendientes</span>
                  {editando
                    ? <textarea className={styles.ncSelect} rows={3} value={(result.pendientes || []).join('\n')} onChange={e => setResult(r => ({...r, pendientes: e.target.value.split('\n')}))} style={{ width: '100%', resize: 'vertical' }} />
                    : <pre className={styles.resultBody}>{(result.pendientes || []).map(p => `• ${p}`).join('\n')}</pre>
                  }
                </div>
                {!editando && (
                  <div className={styles.resultRow} style={{ flexDirection: 'column', gap: 6 }}>
                    <span className={styles.resultLabel}>Borrador del mail</span>
                    <pre className={styles.resultBody}>{buildCuerpoMinuta(result)}</pre>
                  </div>
                )}
              </div>
            )}

            {result && result.tipo === 'nc' && (
              <div className={styles.card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className={styles.badgeNC}>No conformidad</span>
                  <button
                    onClick={() => setEditando(e => !e)}
                    style={{ fontSize: 12, background: 'none', border: '1px solid #e0ddd8', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: editando ? '#c8a96e' : '#888' }}
                  >
                    {editando ? '✓ Guardar cambios' : '✏️ Editar'}
                  </button>
                </div>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Proyecto</span>
                  <span className={styles.resultValue}>{result.proyecto_id ? `#${result.proyecto_id} — ` : ''}{result.proyecto || '—'}</span>
                </div>
                {result.comercial && (
                  <div className={styles.resultRow}>
                    <span className={styles.resultLabel}>Comercial</span>
                    <span className={styles.resultValue}>{result.comercial}</span>
                  </div>
                )}
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Producto</span>
                  {editando
                    ? <input className={styles.ncSelect} value={result.producto || ''} onChange={e => setResult(r => ({...r, producto: e.target.value}))} style={{ flex: 1 }} />
                    : <span className={styles.resultValue}>{result.producto || '—'}</span>
                  }
                </div>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Sector</span>
                  {editando
                    ? <input className={styles.ncSelect} value={result.sector || ''} onChange={e => setResult(r => ({...r, sector: e.target.value}))} style={{ flex: 1 }} />
                    : <span className={styles.resultValue}>{result.sector || '—'}</span>
                  }
                </div>
                <div className={styles.resultRow} style={{ flexDirection: 'column', gap: 6 }}>
                  <span className={styles.resultLabel}>Descripción del problema</span>
                  {editando
                    ? <textarea className={styles.ncSelect} rows={4} value={result.descripcion || ''} onChange={e => setResult(r => ({...r, descripcion: e.target.value}))} style={{ width: '100%', resize: 'vertical' }} />
                    : <pre className={styles.resultBody}>{result.descripcion || '—'}</pre>
                  }
                </div>
                <div className={styles.resultRow} style={{ flexDirection: 'column', gap: 6 }}>
                  <span className={styles.resultLabel}>Causa</span>
                  {editando
                    ? <input className={styles.ncSelect} value={result.causa || ''} onChange={e => setResult(r => ({...r, causa: e.target.value}))} style={{ flex: 1 }} />
                    : <span className={styles.resultValue}>{result.causa || '—'}</span>
                  }
                </div>
                {result.contramedidas && result.contramedidas.length > 0 && (
                  <div className={styles.resultRow} style={{ flexDirection: 'column', gap: 6 }}>
                    <span className={styles.resultLabel}>Contramedidas</span>
                    {editando
                      ? <textarea className={styles.ncSelect} rows={4} value={(result.contramedidas || []).join('\n')} onChange={e => setResult(r => ({...r, contramedidas: e.target.value.split('\n')}))} style={{ width: '100%', resize: 'vertical' }} />
                      : <pre className={styles.resultBody}>{(result.contramedidas || []).map(c => `• ${c}`).join('\n')}</pre>
                    }
                  </div>
                )}
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
                      </>
                    : <>
                        Origen: <strong>{origenSelObj?.label || result.departamento_nc || 'A confirmar'}</strong>
                        <br/>
                        Responsable: <strong>{respEmpleado?.nombre || respExterno || 'A determinar'}</strong>
                        <br/>
                        Notificar a: <strong>Eric Regner · Joaquín Urién{result.comercial ? ` · ${result.comercial}` : ''}</strong>
                      </>
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
                  {(result.tipo === 'minuta' || result.tipo === 'nc') && (
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
                <button
                  className={styles.copyBtn}
                  onClick={descargarPDF}
                  style={{ width: '100%', marginTop: 4 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Descargar PDF
                </button>
                {result.proyecto_id && !guardadoOdoo && (
                  result.tipo === 'minuta' ? (
                    <button
                      className={styles.copyBtn}
                      onClick={() => guardarEnOdoo('crm')}
                      disabled={guardandoOdoo}
                      style={{ width: '100%', marginTop: 4 }}
                    >
                      {guardandoOdoo ? 'Guardando...' : '📁 Guardar en ODOO'}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                      <p style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Guardar en ODOO</p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className={styles.copyBtn}
                          onClick={() => guardarEnOdoo('calidad')}
                          disabled={guardandoOdoo}
                          style={{ flex: 1, opacity: guardandoOdoo && destino !== 'calidad' ? 0.4 : 1 }}
                        >
                          {guardandoOdoo && destino === 'calidad' ? 'Guardando...' : '🔍 Solo Calidad'}
                        </button>
                        <button
                          className={styles.copyBtn}
                          onClick={() => guardarEnOdoo('crm')}
                          disabled={guardandoOdoo}
                          style={{ flex: 1, opacity: guardandoOdoo && destino !== 'crm' ? 0.4 : 1 }}
                        >
                          {guardandoOdoo && destino === 'crm' ? 'Guardando...' : '📁 Solo CRM'}
                        </button>
                        <button
                          className={styles.copyBtn}
                          onClick={() => guardarEnOdoo('ambos')}
                          disabled={guardandoOdoo}
                          style={{ flex: 1, opacity: guardandoOdoo && destino !== 'ambos' ? 0.4 : 1 }}
                        >
                          {guardandoOdoo && destino === 'ambos' ? 'Guardando...' : '✓ Calidad + CRM'}
                        </button>
                      </div>
                    </div>
                  )
                )}
                {guardadoOdoo && (
                  <>
                    <p style={{ fontSize: 13, color: '#27ae60', textAlign: 'center', marginTop: 4 }}>
                      ✓ Guardado en ODOO ({destino === 'calidad' ? 'Calidad' : destino === 'crm' ? 'CRM' : 'Calidad + CRM'})
                    </p>
                    {driveInfo?.ok && (
                      <p style={{ fontSize: 12, color: '#27ae60', textAlign: 'center', marginTop: 2 }}>
                        📁 {driveInfo.fileName} —{' '}
                        <a href={driveInfo.folderUrl} target="_blank" rel="noopener noreferrer"
                          style={{ color: '#c8a96e', textDecoration: 'underline' }}>
                          Ver en Drive
                        </a>
                      </p>
                    )}
                    {driveInfo && !driveInfo.ok && (
                      <p style={{ fontSize: 11, color: '#e67e22', textAlign: 'center', marginTop: 2 }}>
                        ⚠ Drive no disponible — minuta guardada solo en ODOO
                      </p>
                    )}
                  </>
                )}
              </>
            )}

            {showConfirmReset ? (
              <div className={styles.confirmModal}>
                <p className={styles.confirmText}>¿Seguro que querés empezar un nuevo registro? Perdés el documento actual.</p>
                <div className={styles.confirmBtns}>
                  <button className={styles.confirmSi} onClick={() => { reset(); setShowConfirmReset(false) }}>Sí, nuevo registro</button>
                  <button className={styles.confirmNo} onClick={() => setShowConfirmReset(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button className={styles.btnSecondary} onClick={() => setShowConfirmReset(true)}>Nuevo registro</button>
            )}
          </>
        )}
      </div>
    </main>
  )
}
