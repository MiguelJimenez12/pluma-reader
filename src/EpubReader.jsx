import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import ePub from 'epubjs'
import { Bookmark, BookOpen, ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react'
import { getFile } from './db'

function flattenToc(items, depth = 0) {
  return (items || []).flatMap(item => [{ id: item.id || item.href, label: item.label?.trim() || 'Capítulo', href: item.href, depth }, ...flattenToc(item.subitems, depth + 1)])
}

const EpubReader = forwardRef(function EpubReader({ book, settings, panel, closePanel, updateBook, onStatus, onError }, ref) {
  const stageRef = useRef(null)
  const bookRef = useRef(null)
  const renditionRef = useRef(null)
  const locationRef = useRef(null)
  const locationsReady = useRef(false)
  const currentChapterRef = useRef('')
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const previousSettingsRef = useRef(settings)
  const [toc, setToc] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [activeBookmark, setActiveBookmark] = useState(false)
  const bookId = book.id

  useImperativeHandle(ref, () => ({
    toggleBookmark: async () => {
      const cfi = locationRef.current?.start?.cfi
      if (!cfi) return
      const exists = book.bookmarks?.some(b => b.position === cfi)
      const bookmarks = exists ? book.bookmarks.filter(b => b.position !== cfi) : [...(book.bookmarks || []), { id: crypto.randomUUID(), position: cfi, label: currentChapterRef.current || 'Posición guardada', addedAt: Date.now() }]
      await updateBook(bookId, { bookmarks })
      setActiveBookmark(!exists)
    },
  }), [book.bookmarks, bookId, updateBook])

  useEffect(() => {
    let cancelled = false
    let epub
    let rendition
    let generationPromise
    async function setup() {
      try {
        const file = await getFile(bookId)
        if (!file) throw new Error('No se encontró el archivo guardado.')
        epub = ePub(await file.arrayBuffer())
        bookRef.current = epub
        await epub.ready
        const navigation = await epub.loaded.navigation
        if (cancelled) return
        setToc(flattenToc(navigation.toc))
        rendition = epub.renderTo(stageRef.current, { width: '100%', height: '100%', spread: 'none', flow: 'paginated', allowScriptedContent: false })
        renditionRef.current = rendition
        rendition.hooks.content.register(contents => applyContentStyles(contents, settingsRef.current))
        rendition.on('relocated', location => {
          if (cancelled || !location?.start?.cfi) return
          locationRef.current = location
          const item = navigation.get(location.start.href)
          const label = item?.label?.trim() || `Capítulo ${Math.max(1, (location.start.index || 0) + 1)}`
          currentChapterRef.current = label
          let progress = book.progress || 0
          if (locationsReady.current) progress = location.atEnd ? 1 : Math.min(1, Math.max(0, epub.locations.percentageFromCfi(location.start.cfi) || 0))
          onStatus({ progress, label, current: null, total: null })
          updateBook(bookId, { position: location.start.cfi, progress }).catch(() => onError('No se pudo guardar la posición de lectura.'))
        })
        rendition.on('displayError', () => onError('No se pudo mostrar este capítulo.'))
        applyTheme(rendition, settingsRef.current)
        await rendition.display(book.position || undefined)
        if (cancelled) return
        setLoading(false)
        generationPromise = epub.locations.generate(1400).then(() => {
          if (cancelled) return
          locationsReady.current = true
          const cfi = locationRef.current?.start?.cfi
          if (cfi) {
            const progress = locationRef.current?.atEnd ? 1 : Math.min(1, Math.max(0, epub.locations.percentageFromCfi(cfi) || 0))
            onStatus({ progress, label: currentChapterRef.current, current: null, total: null })
            updateBook(bookId, { progress }).catch(() => {})
          }
        }).catch(() => {})
      } catch (error) {
        if (!cancelled) { console.error(error); setLoading(false); onError(error.message || 'No se pudo abrir este EPUB.') }
      }
    }
    setup()
    return () => {
      cancelled = true
      locationsReady.current = false
      renditionRef.current = null
      bookRef.current = null
      try { rendition?.destroy() } catch {}
      if (epub) {
        if (generationPromise) generationPromise.finally(() => { try { epub.destroy() } catch {} })
        else { try { epub.destroy() } catch {} }
      }
    }
    // This effect intentionally initializes the file only when changing books.
  }, [bookId])

  useEffect(() => {
    const rendition = renditionRef.current
    const previous = previousSettingsRef.current
    previousSettingsRef.current = settings
    if (!rendition) return
    applyTheme(rendition, settings)
    if (previous.fontSize === settings.fontSize && previous.fontFamily === settings.fontFamily && previous.lineHeight === settings.lineHeight) return
    const timer = setTimeout(() => {
      if (renditionRef.current !== rendition) return
      const cfi = locationRef.current?.start?.cfi
      if (!cfi) return
      rendition.clear()
      rendition.display(cfi).catch(() => onError('No se pudo actualizar la página.'))
    }, 120)
    return () => clearTimeout(timer)
  }, [settings])
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(entries => {
      const rendition = renditionRef.current
      const cfi = locationRef.current?.start?.cfi
      if (!rendition || !cfi) return
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) rendition.resize(Math.round(width), Math.round(height), cfi)
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { setActiveBookmark(!!book.bookmarks?.some(b => b.position === locationRef.current?.start?.cfi)) }, [book.bookmarks, book.position])
  useEffect(() => {
    const handle = e => {
      if (e.target.closest('input, textarea, select')) return
      if (e.key === 'ArrowRight') renditionRef.current?.next()
      if (e.key === 'ArrowLeft') renditionRef.current?.prev()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])
  const goTo = async target => { try { await renditionRef.current?.display(target); closePanel() } catch { onError('No se pudo abrir esa posición.') } }
  const search = async e => {
    e?.preventDefault()
    const term = query.trim()
    if (!term || !bookRef.current) { setResults([]); return }
    setSearching(true); setSearched(false); setResults([])
    try {
      const epub = bookRef.current
      const found = []
      for (const section of epub.spine.spineItems) {
        if (found.length >= 150) break
        await section.load(epub.load.bind(epub))
        const matches = section.find(term)
        const title = toc.find(item => section.href && item.href?.split('#')[0] === section.href)?.label || `Capítulo ${section.index + 1}`
        found.push(...matches.slice(0, 150 - found.length).map(match => ({ ...match, title })))
        section.unload()
      }
      setResults(found); setSearched(true)
    } catch (error) { console.error(error); onError('No se pudo buscar en este libro.') }
    finally { setSearching(false) }
  }
  return <div className="reading-workspace">
    {panel && <aside className="reader-panel"><div className="panel-head"><strong>{panel === 'toc' ? 'Contenido' : panel === 'search' ? 'Buscar en el libro' : 'Marcadores'}</strong><button className="icon-button" aria-label="Cerrar panel" onClick={closePanel}><X size={18}/></button></div>
      {panel === 'toc' && <div className="panel-list">{toc.length ? toc.map((item, i) => <button key={`${item.id}-${i}`} style={{paddingLeft: `${18 + item.depth * 16}px`}} onClick={() => goTo(item.href)}>{item.label}</button>) : <div className="panel-empty"><BookOpen size={24}/><p>Este EPUB no incluye tabla de contenidos.</p></div>}</div>}
      {panel === 'bookmarks' && <div className="panel-list">{book.bookmarks?.length ? [...book.bookmarks].sort((a,b) => a.addedAt-b.addedAt).map(item => <div className="bookmark-row" key={item.id}><button onClick={() => goTo(item.position)}><Bookmark size={16}/><span>{item.label}</span></button><button className="bookmark-remove" aria-label={`Eliminar marcador de ${item.label}`} onClick={() => updateBook(bookId, { bookmarks: book.bookmarks.filter(b => b.id !== item.id) })}><X size={15}/></button></div>) : <div className="panel-empty"><Bookmark size={24}/><p>Guarda posiciones con el botón «Marcar».</p></div>}</div>}
      {panel === 'search' && <><form className="panel-search" onSubmit={search}><Search size={17}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Palabra o frase" aria-label="Buscar palabra o frase"/><button type="submit" disabled={searching}>Buscar</button></form><div className="panel-list search-results">{searching ? <div className="panel-empty"><Loader2 className="spin" size={24}/><p>Buscando en el libro…</p></div> : results.length ? results.map((result, i) => <button key={`${result.cfi}-${i}`} onClick={() => goTo(result.cfi)}><small>{result.title}</small><span>{result.excerpt || query}</span></button>) : query ? <div className="panel-empty"><Search size={24}/><p>{searched ? 'No hay coincidencias en este libro.' : 'Escribe una palabra y pulsa Buscar.'}</p></div> : null}</div></>}
    </aside>}
    <div className="epub-stage-shell" style={{ '--reading-width': `${settings.width}px`, '--reading-margin': `${settings.margins}px` }}><button className="page-edge previous" aria-label="Página anterior" onClick={() => renditionRef.current?.prev()}><ChevronLeft size={22}/></button><div className="epub-stage" ref={stageRef}/>{loading && <div className="stage-loading"><Loader2 className="spin" size={25}/><span>Abriendo libro…</span></div>}<button className="page-edge next" aria-label="Página siguiente" onClick={() => renditionRef.current?.next()}><ChevronRight size={22}/></button></div>
  </div>
})

function applyTheme(rendition, settings) {
  const colors = settings.theme === 'dark' ? { bg: '#1b2423', text: '#e8e6df' } : settings.theme === 'sepia' ? { bg: '#f2ead9', text: '#3b352b' } : { bg: '#fffefa', text: '#222b29' }
  rendition.themes.override('background-color', colors.bg, true)
  rendition.themes.override('color', colors.text, true)
  rendition.themes.fontSize(`${settings.fontSize}px`)
  rendition.themes.override('line-height', String(settings.lineHeight), true)
  rendition.getContents().forEach(contents => applyContentStyles(contents, settings))
}

function applyContentStyles(contents, settings) {
  const font = settings.fontFamily === 'sans' ? 'Arial, Helvetica, sans-serif' : 'Georgia, Times New Roman, serif'
  contents.addStylesheetCss(`
    body, body * { font-family: ${font} !important; }
    body { font-size: ${settings.fontSize}px !important; line-height: ${settings.lineHeight} !important; }
    body p, body li, body blockquote { font-size: inherit !important; line-height: ${settings.lineHeight} !important; }
  `, 'pluma-reader-settings')
}

export default EpubReader
