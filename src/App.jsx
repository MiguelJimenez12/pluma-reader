import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, Bookmark, Check, ChevronLeft, ChevronRight, Clock3, FolderOpen, LayoutGrid, Maximize, Minimize, MoreHorizontal, Plus, Search, Settings2, Trash2, UploadCloud, X } from 'lucide-react'
import { deleteBook, getBook, getBooks, getSettings, saveBook, saveSettings } from './db'
import { importFiles } from './bookImport'

const EpubReader = lazy(() => import('./EpubReader'))
const PdfReader = lazy(() => import('./PdfReader'))

// Estos valores sirven de base cuando aún no hay preferencias guardadas.
const defaultSettings = { theme: 'light', fontSize: 18, fontFamily: 'serif', lineHeight: 1.65, margins: 48, width: 760 }

function formatProgress(value) { return `${Math.round((value || 0) * 100)}%` }
function bookCount(n) { return `${n} ${n === 1 ? 'libro' : 'libros'}` }

function Cover({ book, className = '' }) {
  const [url, setUrl] = useState(null)
  // La portada se guarda como Blob; la URL temporal se libera al cambiar de libro.
  useEffect(() => {
    if (!book.cover) return
    const objectUrl = URL.createObjectURL(book.cover)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [book.cover])
  return <div className={`book-cover ${className} ${url ? 'has-image' : ''} ${book.format.toLowerCase()}`}>
    {url ? <img src={url} alt={`Portada de ${book.title}`} /> : <div className="fallback-cover"><span className="fallback-mark">✳</span><strong>{book.title}</strong><small>{book.author}</small></div>}
  </div>
}

function BookCard({ book, onOpen, onDelete }) {
  const [menu, setMenu] = useState(false)
  return <article className="book-card">
    <button className="book-card-main" onClick={() => onOpen(book.id)} aria-label={`Abrir ${book.title}`}>
      <Cover book={book} />
      <span className="book-info"><strong title={book.title}>{book.title}</strong><span title={book.author}>{book.author}</span></span>
      <span className="card-bottom"><span className="format-label">{book.format}</span><span>{book.progress ? formatProgress(book.progress) : 'Sin empezar'}</span></span>
      <span className="progress-track"><span style={{ width: formatProgress(book.progress) }} /></span>
    </button>
    <div className="card-actions">
      <button className="icon-button" aria-label={`Opciones de ${book.title}`} aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={18} /></button>
      {menu && <div className="card-menu"><button onClick={() => { setMenu(false); onDelete(book) }}><Trash2 size={15} /> Eliminar libro</button></div>}
    </div>
  </article>
}

function Sidebar({ view, setView, count, onImport }) {
  return <aside className="sidebar">
      <div className="brand"><div className="brand-symbol"><BookOpen size={21} strokeWidth={1.8} /></div><span>pluma<span className="brand-dot">.</span></span></div>
      <nav aria-label="Biblioteca"><p className="nav-caption">EXPLORAR</p><button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}><LayoutGrid size={18} /> Biblioteca <span>{count}</span></button><button className={view === 'reading' ? 'active' : ''} onClick={() => setView('reading')}><BookOpen size={18} /> Leyendo</button><button className={view === 'finished' ? 'active' : ''} onClick={() => setView('finished')}><Check size={18} /> Terminados</button></nav>
      <div className="sidebar-bottom"><button className="sidebar-import" onClick={onImport}><Plus size={18} /> Añadir libros</button><p>Tus libros se guardan en este dispositivo.</p></div>
    </aside>
}

function LibraryView({ books, onOpen, onImport, onDelete, busy, view, setView, error, clearError }) {
  const [query, setQuery] = useState('')
  // Primero aplica la sección elegida y después la búsqueda por título o autor.
  const filtered = books.filter(b => (view === 'reading' ? b.progress > 0 && b.progress < 1 : view === 'finished' ? b.progress >= 1 : true)).filter(b => `${b.title} ${b.author}`.toLowerCase().includes(query.toLowerCase()))
  const recent = books.find(b => b.lastOpenedAt && b.progress < 1)
  return <main className="library-content">
    <div className="library-topline"><div><span className="eyebrow">TU ESPACIO DE LECTURA</span><h1>{view === 'reading' ? 'Leyendo' : view === 'finished' ? 'Terminados' : 'Tu biblioteca'}</h1><p>{books.length ? `${bookCount(filtered.length)} en esta sección` : 'Un buen libro siempre encuentra su lugar.'}</p></div><button className="primary-button" onClick={onImport} disabled={busy}><Plus size={18} /> Añadir libro</button></div>
    {error && <div className="notice" role="alert"><span>{error}</span><button aria-label="Cerrar aviso" onClick={clearError}><X size={16}/></button></div>}
    {recent && view === 'all' && !query && <section className="continue-section"><div className="section-title"><h2>Continuar leyendo</h2><span>Retoma donde lo dejaste</span></div><button className="continue-card" onClick={() => onOpen(recent.id)}><Cover book={recent} className="continue-cover" /><span className="continue-copy"><span className="continue-kicker"><Clock3 size={15} /> EN CURSO</span><strong>{recent.title}</strong><span>{recent.author}</span><span className="continue-progress"><span className="progress-track"><span style={{width: formatProgress(recent.progress)}}/></span><small>{formatProgress(recent.progress)} completado</small></span></span><span className="continue-action">Seguir leyendo <ChevronRight size={18}/></span></button></section>}
    <section className="books-section"><div className="section-title"><h2>{view === 'all' ? 'Todos los libros' : view === 'reading' ? 'En lectura' : 'Lecturas terminadas'}</h2>{books.length > 0 && <div className="library-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en tu biblioteca" aria-label="Buscar en tu biblioteca" /></div>}</div>
      {filtered.length ? <div className="book-grid">{filtered.map(book => <BookCard key={book.id} book={book} onOpen={onOpen} onDelete={onDelete}/>)}</div> : books.length === 0 ? <div className="empty-library"><div className="empty-icon"><FolderOpen size={32} strokeWidth={1.4}/></div><h3>Tu biblioteca comienza aquí</h3><p>Importa un EPUB o PDF para empezar a leer. Tus libros y tu progreso quedarán guardados en este dispositivo.</p><button className="primary-button" onClick={onImport} disabled={busy}><UploadCloud size={18}/>{busy ? 'Importando…' : 'Importar libros'}</button><span>También puedes arrastrar archivos a esta ventana</span></div> : <div className="empty-filter"><BookOpen size={26}/><h3>{query ? 'No encontramos ese libro' : 'Aún no hay libros aquí'}</h3><p>{query ? 'Prueba con otro título o autor.' : view === 'finished' ? 'Los libros que termines aparecerán en esta sección.' : 'Abre un libro y empieza a leer para verlo aquí.'}</p>{!query && <button onClick={() => setView('all')}>Ver biblioteca</button>}</div>}
    </section>
  </main>
}

export default function App() {
  const [books, setBooks] = useState([])
  const [settings, setSettings] = useState(defaultSettings)
  const [activeId, setActiveId] = useState(null)
  const [view, setView] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const inputRef = useRef(null)
  const dragDepth = useRef(0)
  const pendingBookUpdates = useRef(new Map())
  const currentSettings = useRef(defaultSettings)
  const pendingSettingsSave = useRef(Promise.resolve())
  const activeBook = books.find(b => b.id === activeId)

  // La biblioteca y las preferencias se recuperan del almacenamiento del navegador al iniciar.
  useEffect(() => { Promise.all([getBooks(), getSettings()]).then(([savedBooks, savedSettings]) => { setBooks(savedBooks); if (savedSettings) { currentSettings.current = {...defaultSettings, ...savedSettings}; setSettings(currentSettings.current) } setReady(true) }).catch(() => { setError('No se pudo abrir el almacenamiento local. Comprueba los permisos del navegador.'); setReady(true) }) }, [])
  const refresh = useCallback(async () => setBooks(await getBooks()), [])
  // Serializa los cambios de cada libro para que progreso y marcadores no se sobrescriban.
  const updateBook = useCallback((id, patch) => {
    const previous = pendingBookUpdates.current.get(id) || Promise.resolve()
    const next = previous.catch(() => {}).then(async () => {
      const current = await getBook(id)
      if (!current) return
      const updated = { ...current, ...patch, updatedAt: Date.now() }
      await saveBook(updated)
      setBooks(prev => prev.map(b => b.id === id ? updated : b))
    })
    pendingBookUpdates.current.set(id, next)
    next.finally(() => { if (pendingBookUpdates.current.get(id) === next) pendingBookUpdates.current.delete(id) }).catch(() => {})
    return next
  }, [])
  // Guarda los ajustes en el mismo orden en que el usuario los modifica.
  const updateSettings = useCallback(patch => {
    const next = { ...currentSettings.current, ...patch }
    currentSettings.current = next
    setSettings(next)
    pendingSettingsSave.current = pendingSettingsSave.current.catch(() => {}).then(() => saveSettings(next))
    return pendingSettingsSave.current.catch(() => setError('No se pudieron guardar los ajustes de lectura.'))
  }, [])
  const openBook = useCallback(async id => {
    setActiveId(id)
    await updateBook(id, { lastOpenedAt: Date.now() }).catch(() => setError('No se pudo guardar la fecha de lectura.'))
  }, [updateBook])
  // Procesa varios archivos, informa de errores o duplicados y restablece el selector.
  const handleFiles = useCallback(async files => {
    if (!files?.length) return
    setBusy(true); setError('')
    try {
      const results = await importFiles(files, refresh)
      await refresh()
      const failures = results.filter(r => r.error)
      const duplicates = results.filter(r => r.duplicate)
      if (failures.length) setError(failures.map(r => `${r.file}: ${r.error}`).join(' '))
      else if (duplicates.length) setError(duplicates.length === 1 ? 'Ese libro ya está en tu biblioteca.' : `${duplicates.length} libros ya estaban en tu biblioteca.`)
    } catch { setError('No se pudieron guardar los archivos. Revisa el espacio disponible en este dispositivo.') }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }, [refresh])
  const confirmDelete = async () => {
    if (!deleteTarget) return
    // Espera las escrituras pendientes antes de borrar también el archivo asociado.
    try { await pendingBookUpdates.current.get(deleteTarget.id)?.catch(() => {}); await deleteBook(deleteTarget.id); await refresh(); if (activeId === deleteTarget.id) setActiveId(null) }
    catch { setError('No se pudo eliminar el libro.') }
    setDeleteTarget(null)
  }
  // Los eventos viven en la ventana para aceptar archivos sobre toda la biblioteca.
  useEffect(() => {
    const enter = e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); dragDepth.current++; setDragging(true) } }
    const leave = e => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false) }
    const over = e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault() }
    const drop = e => { e.preventDefault(); dragDepth.current = 0; setDragging(false); handleFiles(e.dataTransfer.files) }
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave); window.addEventListener('dragover', over); window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  }, [handleFiles])
  return <div className={`app-shell ${activeBook ? 'is-reading' : ''}`}>
    <input ref={inputRef} type="file" accept=".epub,.pdf,application/epub+zip,application/pdf" multiple hidden onChange={e => handleFiles(e.target.files)} />
    {!ready ? <div className="app-loading"><BookOpen size={32}/><span>Abriendo tu biblioteca…</span></div> : activeBook ? <Reader book={activeBook} settings={settings} updateSettings={updateSettings} updateBook={updateBook} onBack={() => { setActiveId(null); refresh() }} /> : <><Sidebar view={view} setView={setView} count={books.length} onImport={() => inputRef.current?.click()}/><div className="main-column"><LibraryView books={books} onOpen={openBook} onImport={() => inputRef.current?.click()} onDelete={setDeleteTarget} busy={busy} view={view} setView={setView} error={error} clearError={() => setError('')}/></div></>}
    {dragging && <div className="drop-overlay"><div><UploadCloud size={42}/><strong>Suelta tus libros aquí</strong><span>Archivos EPUB o PDF</span></div></div>}
    {deleteTarget && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}><div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><div className="dialog-icon"><Trash2 size={22}/></div><h2 id="delete-title">¿Eliminar este libro?</h2><p>Se eliminarán «{deleteTarget.title}», sus marcadores y su progreso de lectura de este dispositivo.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="danger-button" onClick={confirmDelete}>Eliminar libro</button></div></div></div>}
  </div>
}

function Reader({ book, settings, updateSettings, updateBook, onBack }) {
  const [panel, setPanel] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [status, setStatus] = useState({ progress: book.progress || 0, label: '', current: null, total: null })
  const [readerError, setReaderError] = useState('')
  const shellRef = useRef(null)
  const readerRef = useRef(null)
  // El estado visual sigue los cambios de pantalla completa iniciados por el navegador.
  useEffect(() => { const f = () => setFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f) }, [])
  const toggleFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await shellRef.current?.requestFullscreen() } catch { setReaderError('El navegador no permitió entrar en pantalla completa.') } }
  const toggleBookmark = () => readerRef.current?.toggleBookmark()
  return <div className={`reader-shell theme-${settings.theme}`} ref={shellRef}>
    <header className="reader-header"><button className="reader-back" aria-label="Volver a biblioteca" onClick={onBack}><ChevronLeft size={20}/><span>Biblioteca</span></button><div className="reader-heading"><strong>{book.title}</strong><span>{book.author}</span></div><div className="reader-toolbar"><button className={`icon-button ${panel === 'toc' ? 'selected' : ''}`} title={book.format === 'EPUB' ? 'Tabla de contenidos' : 'Páginas'} aria-label={book.format === 'EPUB' ? 'Tabla de contenidos' : 'Páginas'} onClick={() => { setPanel(panel === 'toc' ? null : 'toc'); setSettingsOpen(false) }}><LayoutGrid size={19}/></button><button className={`icon-button ${panel === 'search' ? 'selected' : ''}`} title="Buscar en el libro" aria-label="Buscar en el libro" onClick={() => { setPanel(panel === 'search' ? null : 'search'); setSettingsOpen(false) }}><Search size={19}/></button><button className={`icon-button ${panel === 'bookmarks' ? 'selected' : ''}`} title="Marcadores" aria-label="Marcadores" onClick={() => { setPanel(panel === 'bookmarks' ? null : 'bookmarks'); setSettingsOpen(false) }}><Bookmark size={19}/></button><div className="settings-anchor"><button className={`icon-button ${settingsOpen ? 'selected' : ''}`} title="Ajustes de lectura" aria-label="Ajustes de lectura" onClick={() => { setSettingsOpen(!settingsOpen); setPanel(null) }}><Settings2 size={19}/></button>{settingsOpen && <SettingsPopover settings={settings} update={updateSettings} epub={book.format === 'EPUB'} onClose={() => setSettingsOpen(false)}/>}</div><button className="icon-button fullscreen-button" title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} onClick={toggleFullscreen}>{fullscreen ? <Minimize size={19}/> : <Maximize size={19}/>}</button></div></header>
    {readerError && <div className="reader-notice" role="alert">{readerError}<button onClick={() => setReaderError('')}><X size={16}/></button></div>}
    <div className="reader-body">
      <Suspense fallback={<div className="stage-loading">Preparando lector…</div>}>{book.format === 'EPUB' ? <EpubReader ref={readerRef} book={book} settings={settings} panel={panel} closePanel={() => setPanel(null)} updateBook={updateBook} onStatus={setStatus} onError={setReaderError}/> : <PdfReader ref={readerRef} book={book} settings={settings} panel={panel} closePanel={() => setPanel(null)} updateBook={updateBook} onStatus={setStatus} onError={setReaderError}/>}</Suspense>
    </div>
    <footer className="reader-footer"><span className="reader-location">{status.label || (book.format === 'PDF' ? 'Página 1' : 'Preparando lectura…')}</span><span className="footer-track"><span style={{width: formatProgress(status.progress)}}/></span><span className="reader-percent">{formatProgress(status.progress)}</span><button className="footer-bookmark" onClick={toggleBookmark} aria-label="Añadir o quitar marcador"><Bookmark size={17}/><span>Marcar</span></button></footer>
  </div>
}

function SettingsPopover({ settings, update, epub, onClose }) {
  return <div className="settings-popover" role="dialog" aria-label="Ajustes de lectura"><div className="popover-head"><strong>Ajustes de lectura</strong><button aria-label="Cerrar ajustes" onClick={onClose}><X size={17}/></button></div><label className="setting-label">Tema</label><div className="theme-options">{[['light','Claro'],['sepia','Sepia'],['dark','Oscuro']].map(([key,label]) => <button key={key} className={`theme-choice ${key} ${settings.theme === key ? 'active' : ''}`} onClick={() => update({theme:key})}><span>Aa</span>{label}</button>)}</div>{epub && <><label className="setting-label" htmlFor="font-size">Tamaño de letra <span>{settings.fontSize}px</span></label><input id="font-size" type="range" min="14" max="28" value={settings.fontSize} onChange={e => update({fontSize:Number(e.target.value)})}/><label className="setting-label" htmlFor="font-family">Tipo de letra</label><select id="font-family" value={settings.fontFamily} onChange={e => update({fontFamily:e.target.value})}><option value="serif">Clásica</option><option value="sans">Moderna</option></select><label className="setting-label" htmlFor="line-height">Interlineado <span>{settings.lineHeight.toFixed(1)}</span></label><input id="line-height" type="range" min="1.2" max="2.2" step="0.1" value={settings.lineHeight} onChange={e => update({lineHeight:Number(e.target.value)})}/><label className="setting-label" htmlFor="margins">Márgenes <span>{settings.margins}px</span></label><input id="margins" type="range" min="16" max="96" step="8" value={settings.margins} onChange={e => update({margins:Number(e.target.value)})}/><label className="setting-label" htmlFor="text-width">Ancho del texto <span>{settings.width}px</span></label><input id="text-width" type="range" min="540" max="1100" step="20" value={settings.width} onChange={e => update({width:Number(e.target.value)})}/></>}</div>
}
