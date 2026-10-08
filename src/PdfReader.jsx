import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Bookmark, ChevronLeft, ChevronRight, FileText, Loader2, Minus, Plus, Search, X } from 'lucide-react'
import { getFile } from './db'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

const PdfReader = forwardRef(function PdfReader({ book, settings, panel, closePanel, updateBook, onStatus, onError }, ref) {
  const [pdf, setPdf] = useState(null)
  const [page, setPage] = useState(Math.max(1, Number(book.position) || 1))
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [stageWidth, setStageWidth] = useState(800)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const pageRef = useRef(page)
  pageRef.current = page
  const bookId = book.id

  useImperativeHandle(ref, () => ({
    toggleBookmark: async () => {
      const current = pageRef.current
      const exists = book.bookmarks?.some(b => b.position === current)
      const bookmarks = exists ? book.bookmarks.filter(b => b.position !== current) : [...(book.bookmarks || []), { id: crypto.randomUUID(), position: current, label: `Página ${current}`, addedAt: Date.now() }]
      await updateBook(bookId, { bookmarks })
    },
  }), [book.bookmarks, bookId, updateBook])

  useEffect(() => {
    let cancelled = false
    let doc
    let task
    async function setup() {
      try {
        const file = await getFile(bookId)
        if (!file) throw new Error('No se encontró el archivo guardado.')
        task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
        doc = await task.promise
        if (cancelled) return
        setPdf(doc)
        setLoading(false)
      } catch (error) { if (!cancelled) { console.error(error); onError(error.message || 'No se pudo abrir este PDF.'); setLoading(false) } }
    }
    setup()
    return () => { cancelled = true; if (task && !doc) task.destroy(); if (doc) doc.destroy() }
  }, [bookId])

  useEffect(() => {
    if (!stageRef.current) return
    const observer = new ResizeObserver(entries => setStageWidth(entries[0].contentRect.width))
    observer.observe(stageRef.current)
    return () => observer.disconnect()
  }, [panel])

  useEffect(() => {
    if (!pdf || !canvasRef.current) return
    let cancelled = false
    let renderTask
    async function render() {
      setRendering(true)
      try {
        const pdfPage = await pdf.getPage(page)
        if (cancelled) return
        const natural = pdfPage.getViewport({ scale: 1 })
        const cssWidth = Math.min(Math.max(280, stageWidth - 64), 900) * zoom
        const viewport = pdfPage.getViewport({ scale: cssWidth / natural.width })
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        const canvas = canvasRef.current
        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        const context = canvas.getContext('2d')
        renderTask = pdfPage.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] })
        await renderTask.promise
      } catch (error) { if (!cancelled && error?.name !== 'RenderingCancelledException') { console.error(error); onError('No se pudo mostrar esta página.') } }
      finally { if (!cancelled) setRendering(false) }
    }
    render()
    return () => { cancelled = true; renderTask?.cancel() }
  }, [pdf, page, zoom, stageWidth])

  useEffect(() => {
    if (!pdf) return
    const progress = page / pdf.numPages
    onStatus({ progress, label: `Página ${page} de ${pdf.numPages}`, current: page, total: pdf.numPages })
    updateBook(bookId, { position: page, progress }).catch(() => onError('No se pudo guardar la página actual.'))
  }, [pdf, page, bookId])

  useEffect(() => {
    const handle = e => {
      if (e.target.closest('input, textarea, select')) return
      if (e.key === 'ArrowRight') setPage(n => pdf ? Math.min(pdf.numPages, n + 1) : n)
      if (e.key === 'ArrowLeft') setPage(n => Math.max(1, n - 1))
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [pdf])

  const goTo = n => { setPage(Math.max(1, Math.min(pdf?.numPages || 1, Number(n) || 1))); closePanel() }
  const search = async e => {
    e?.preventDefault()
    const term = query.trim().toLocaleLowerCase()
    if (!term || !pdf) { setResults([]); return }
    setSearching(true); setSearched(false); setResults([])
    try {
      const found = []
      for (let number = 1; number <= pdf.numPages; number++) {
        const pdfPage = await pdf.getPage(number)
        const content = await pdfPage.getTextContent()
        const text = content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ')
        const lower = text.toLocaleLowerCase()
        let index = lower.indexOf(term)
        while (index !== -1 && found.length < 200) {
          found.push({ page: number, excerpt: `…${text.slice(Math.max(0, index - 48), Math.min(text.length, index + term.length + 75)).trim()}…` })
          index = lower.indexOf(term, index + term.length)
        }
        if (found.length >= 200) break
      }
      setResults(found); setSearched(true)
    } catch (error) { console.error(error); onError('No se pudo buscar en este PDF.') }
    finally { setSearching(false) }
  }

  return <div className="reading-workspace">
    {panel && <aside className="reader-panel"><div className="panel-head"><strong>{panel === 'toc' ? 'Páginas' : panel === 'search' ? 'Buscar en el libro' : 'Marcadores'}</strong><button className="icon-button" aria-label="Cerrar panel" onClick={closePanel}><X size={18}/></button></div>
      {panel === 'toc' && <div className="pdf-page-panel"><p>Ir a la página</p><div><input type="number" min="1" max={pdf?.numPages || 1} defaultValue={page} key={page} aria-label="Número de página" id="jump-page"/><span>de {pdf?.numPages || book.pages || '—'}</span></div><button onClick={() => goTo(document.getElementById('jump-page')?.value)}>Ir a la página</button></div>}
      {panel === 'bookmarks' && <div className="panel-list">{book.bookmarks?.length ? [...book.bookmarks].sort((a,b) => a.position-b.position).map(item => <div className="bookmark-row" key={item.id}><button onClick={() => goTo(item.position)}><Bookmark size={16}/><span>{item.label}</span></button><button className="bookmark-remove" aria-label={`Eliminar marcador de ${item.label}`} onClick={() => updateBook(bookId, { bookmarks: book.bookmarks.filter(b => b.id !== item.id) })}><X size={15}/></button></div>) : <div className="panel-empty"><Bookmark size={24}/><p>Guarda páginas con el botón «Marcar».</p></div>}</div>}
      {panel === 'search' && <><form className="panel-search" onSubmit={search}><Search size={17}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Palabra o frase" aria-label="Buscar palabra o frase"/><button type="submit" disabled={searching}>Buscar</button></form><div className="panel-list search-results">{searching ? <div className="panel-empty"><Loader2 className="spin" size={24}/><p>Buscando en el PDF…</p></div> : results.length ? results.map((result,i) => <button key={`${result.page}-${i}`} onClick={() => goTo(result.page)}><small>Página {result.page}</small><span>{result.excerpt}</span></button>) : query ? <div className="panel-empty"><Search size={24}/><p>{searched ? 'No hay coincidencias en este PDF.' : 'Escribe una palabra y pulsa Buscar.'}</p></div> : null}</div></>}
    </aside>}
    <div className="pdf-stage-shell"><div className="pdf-scroll" ref={stageRef}><div className="pdf-canvas-wrap">{loading ? <div className="stage-loading"><Loader2 className="spin" size={25}/><span>Abriendo PDF…</span></div> : <canvas ref={canvasRef} aria-label={`Página ${page} del PDF`} />}</div></div><div className="pdf-controls"><button className="icon-button" onClick={() => setPage(n => Math.max(1,n-1))} disabled={page <= 1} aria-label="Página anterior"><ChevronLeft size={19}/></button><span>Página <strong>{page}</strong> / {pdf?.numPages || book.pages || '—'}</span><button className="icon-button" onClick={() => setPage(n => Math.min(pdf?.numPages || n,n+1))} disabled={!pdf || page >= pdf.numPages} aria-label="Página siguiente"><ChevronRight size={19}/></button><span className="control-divider"/><button className="icon-button" onClick={() => setZoom(z => Math.max(0.6, Math.round((z-0.1)*10)/10))} aria-label="Reducir zoom"><Minus size={17}/></button><span>{Math.round(zoom*100)}%</span><button className="icon-button" onClick={() => setZoom(z => Math.min(2, Math.round((z+0.1)*10)/10))} aria-label="Aumentar zoom"><Plus size={17}/></button></div></div>
  </div>
})

export default PdfReader
