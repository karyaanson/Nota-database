// Turns a receipt photo into structured data: { merchant, items, total, date }.
//
// This calls YOUR OWN backend endpoint (see /server/extract.js in the README),
// which in turn calls an AI vision model. Keeping this call server-side means
// your API key never sits in browser code that anyone could inspect.
//
// Swap EXTRACT_ENDPOINT for wherever you deploy that function
// (e.g. a Vercel/Cloudflare Worker route).

const EXTRACT_ENDPOINT = import.meta.env.VITE_EXTRACT_ENDPOINT || '/api/extract'

export async function extractReceipt(imageBlob) {
  const base64 = await blobToBase64(imageBlob)

  const res = await fetch(EXTRACT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64, mediaType: imageBlob.type || 'image/jpeg' })
  })

  if (!res.ok) {
    throw new Error(`Extraction failed: ${res.status}`)
  }

  const data = await res.json()
  // Expected shape: { merchant, date, total, items: [{ name, price }] }
  return data
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
