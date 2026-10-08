import { getBooks, saveBook, saveFile } from './db'

function baseName(name) { return name.replace(/\.(epub|pdf)$/i, '').replace(/[_-]+/g, ' ').trim() }

async function epubDetails(file) {
  const { default: ePub } = await import('epubjs')
  const book = ePub(await file.arrayBuffer())
  try {
    await book.ready
    const metadata = await book.loaded.metadata
    let cover = null
    try {
      const coverUrl = await book.coverUrl()
      if (coverUrl) {
        const blob = await (await fetch(coverUrl)).blob()
        if (blob.size) cover = blob
      }
    } catch { /* EPUBs may omit a cover. */ }
    return { title: metadata.title || baseName(file.name), author: metadata.creator || 'Autor desconocido', cover }
  } finally { book.destroy() }
}

async function pdfDetails(file) {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const pdf = await task.promise
    const meta = await pdf.getMetadata().catch(() => null)
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 0.6 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    const cover = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    return { title: meta?.info?.Title || baseName(file.name), author: meta?.info?.Author || 'Autor desconocido', cover, pages: pdf.numPages }
  } finally { await task.destroy() }
}

export async function importFiles(fileList, onEach) {
  const existing = await getBooks()
  const results = []
  for (const file of Array.from(fileList)) {
    const format = /\.epub$/i.test(file.name) ? 'EPUB' : /\.pdf$/i.test(file.name) ? 'PDF' : null
    if (!format) { results.push({ file: file.name, error: 'Solo se admiten archivos EPUB y PDF.' }); continue }
    try {
      const duplicate = existing.find(b => b.fileName === file.name && b.fileSize === file.size)
      if (duplicate) { results.push({ file: file.name, duplicate: true }); continue }
      const details = format === 'EPUB' ? await epubDetails(file) : await pdfDetails(file)
      const id = crypto.randomUUID()
      const now = Date.now()
      const book = { id, ...details, format, fileName: file.name, fileSize: file.size, addedAt: now, updatedAt: now, lastOpenedAt: null, progress: 0, position: null, bookmarks: [] }
      await saveFile(id, file)
      await saveBook(book)
      existing.push(book)
      results.push({ file: file.name, book })
      onEach?.(book)
    } catch (error) {
      console.error('Error al importar', file.name, error)
      results.push({ file: file.name, error: 'No se pudo abrir este archivo. Comprueba que no esté dañado.' })
    }
  }
  return results
}
