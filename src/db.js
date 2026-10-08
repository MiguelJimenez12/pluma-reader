import { openDB } from 'idb'

const dbPromise = openDB('pluma-reader', 1, {
  upgrade(db) {
    const books = db.createObjectStore('books', { keyPath: 'id' })
    books.createIndex('updatedAt', 'updatedAt')
    db.createObjectStore('files')
    db.createObjectStore('settings')
  },
})

export async function getBooks() {
  return (await (await dbPromise).getAll('books')).sort((a, b) => (b.lastOpenedAt || b.updatedAt) - (a.lastOpenedAt || a.updatedAt))
}

export async function getBook(id) { return (await dbPromise).get('books', id) }
export async function getFile(id) { return (await dbPromise).get('files', id) }
export async function saveBook(book) { await (await dbPromise).put('books', book) }
export async function saveFile(id, file) { await (await dbPromise).put('files', file, id) }
export async function deleteBook(id) {
  const db = await dbPromise
  const tx = db.transaction(['books', 'files'], 'readwrite')
  await Promise.all([tx.objectStore('books').delete(id), tx.objectStore('files').delete(id)])
  await tx.done
}
export async function getSettings() { return (await dbPromise).get('settings', 'reader') }
export async function saveSettings(settings) { await (await dbPromise).put('settings', settings, 'reader') }
