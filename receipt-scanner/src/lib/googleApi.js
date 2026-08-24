// Client-side Google Drive + Sheets integration.
// Uses Google Identity Services (GIS) for OAuth — no backend required for this part.
//
// Setup (see README for full walkthrough):
// 1. Create a project in Google Cloud Console.
// 2. Enable the Drive API and Sheets API.
// 3. Create an OAuth 2.0 Client ID (type: Web application).
// 4. Add your dev URL (e.g. http://localhost:5173, or your StackBlitz preview URL)
//    and your deployed URL to "Authorized JavaScript origins".
// 5. Put the client ID in your .env file as VITE_GOOGLE_CLIENT_ID.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets'

let tokenClient = null
let accessToken = null

// Loads the Google Identity Services script once.
function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export async function signIn() {
  await loadGisScript()

  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) return reject(response)
        accessToken = response.access_token
        resolve(accessToken)
      }
    })
    tokenClient.requestAccessToken()
  })
}

export function isSignedIn() {
  return !!accessToken
}

// Looks at existing files in the Drive folder to find the next free 000–999
// sequence number for a given date, so filenames like 2026-08-20_Groceries_001
// don't collide with ones already saved for that same date.
export async function getNextSequenceNumber(date) {
  const folderId = import.meta.env.VITE_DRIVE_FOLDER_ID
  const q = encodeURIComponent(`'${folderId}' in parents and name contains '${date}' and trashed=false`)

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`)
  const data = await res.json()

  const prefix = `${date}_`
  let maxNum = -1
  for (const file of data.files || []) {
    if (!file.name.startsWith(prefix)) continue
    const match = file.name.match(/_(\d{3})(?:\.[^.]+)?$/)
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10))
  }

  return String(Math.min(maxNum + 1, 999)).padStart(3, '0')
}

// Strips anything unsafe/messy for a filename, so "Fast Food!" becomes "FastFood".
export function sanitizeForFilename(str) {
  const cleaned = (str || '').replace(/[^a-zA-Z0-9]+/g, '')
  return cleaned || 'Uncategorized'
}

// Uploads a photo into a specific Drive folder (set via VITE_DRIVE_FOLDER_ID).
export async function uploadReceiptPhoto(blob, filename) {
  const folderId = import.meta.env.VITE_DRIVE_FOLDER_ID

  if (!folderId) {
    throw new Error('VITE_DRIVE_FOLDER_ID is not set — check your environment variables')
  }

  const metadata = { name: filename, parents: [folderId] }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', blob)

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form
  })
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`)
  return res.json() // includes file id
}

// Writes one row per receipt into specific columns, starting at row 8:
//   B = Date, D = Items (comma-separated), F = Total Price,
//   H = COA Code, I = COA Name, J = Filename
// (C, E, G are left untouched — they belong to other data in this sheet.)
// Note: "category" itself is NOT written here — it's only used to build the
// Drive filename. Column D instead gets the actual item list, since category
// alone wasn't specific enough to be useful in the sheet.
//
// This deliberately avoids the Sheets "append" endpoint: append uses a
// heuristic to guess where an existing "table" ends, which gets confused by
// other data elsewhere in the sheet and can land in the wrong columns.
// Instead, we find the exact next empty row ourselves and write directly to it.
export async function appendToSheet({ date, itemsList, total, coa, coaName, filename }) {
  const spreadsheetId = import.meta.env.VITE_SHEET_ID
  const row = await getNextEmptyRow(spreadsheetId)

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `KAS!B${row}`, values: [[date]] },
          { range: `KAS!D${row}`, values: [[itemsList]] },
          { range: `KAS!F${row}`, values: [[total]] },
          { range: `KAS!H${row}`, values: [[coa]] },
          { range: `KAS!I${row}`, values: [[coaName]] },
          { range: `KAS!J${row}`, values: [[filename]] }
        ]
      })
    }
  )
  if (!res.ok) throw new Error(`Sheets write failed: ${res.status}`)
  return res.json()
}

// Reads column B (Date) from row 8 downward to find the first genuinely empty row.
async function getNextEmptyRow(spreadsheetId) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/KAS!B8:B100000`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error(`Sheets read failed: ${res.status}`)
  const data = await res.json()

  const filledCount = (data.values || []).filter((row) => row[0] !== undefined && row[0] !== '').length
  return 8 + filledCount
}
