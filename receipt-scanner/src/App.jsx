import { useState } from 'react'
import CaptureButton from './components/CaptureButton.jsx'
import ReceiptCard from './components/ReceiptCard.jsx'
import { extractReceipt } from './lib/extractReceipt.js'
import { signIn, isSignedIn, uploadReceiptPhoto, appendToSheet, getNextSequenceNumber, sanitizeForFilename } from './lib/googleApi.js'
import { compressImage } from './lib/imageCompression.js'

export default function App() {
  const [receipts, setReceipts] = useState([])
  const [busy, setBusy] = useState(false)

  async function handleCapture(file) {
    setBusy(true)
    const localId = crypto.randomUUID()
    const thumbUrl = URL.createObjectURL(file)

    setReceipts((prev) => [{ id: localId, status: 'pending', thumbUrl }, ...prev])

    try {
      if (!isSignedIn()) await signIn()

      const compressed = await compressImage(file)

      const parsed = await extractReceipt(compressed)
      const category = sanitizeForFilename(parsed.category) // filename only
      const sequence = await getNextSequenceNumber(parsed.date)
      const filename = `${parsed.date}_${category}_${sequence}.jpg`
      const itemsList = (parsed.items || []).map((item) => item.name).filter(Boolean).join(', ')

      await uploadReceiptPhoto(compressed, filename)
      await appendToSheet({ date: parsed.date, itemsList, total: parsed.total, coa: parsed.coa, coaName: parsed.coaName, filename })

      setReceipts((prev) =>
        prev.map((r) => (r.id === localId ? { ...r, ...parsed, thumbUrl, status: 'synced' } : r))
      )
    } catch (err) {
      console.error(err)
      setReceipts((prev) => prev.map((r) => (r.id === localId ? { ...r, status: 'error' } : r)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Receipts</h1>
        <span className="eyebrow">Drive + Sheets</span>
      </header>

      <CaptureButton onCapture={handleCapture} disabled={busy} />

      {receipts.length === 0 ? (
        <div className="empty-state">No receipts yet. Tap above to scan your first one.</div>
      ) : (
        receipts.map((r) => <ReceiptCard key={r.id} receipt={r} />)
      )}
    </div>
  )
}
