// Deploy this as a serverless function. Reads the receipt photo, asks Gemini
// to extract structured data, and returns it as JSON.
//
// Get a free API key (no credit card needed) at https://aistudio.google.com/apikey
// Set GEMINI_API_KEY as an environment variable in your hosting provider's dashboard.

// Chart of accounts — Gemini picks the single best-fitting code per receipt.
// Most everyday purchases will fall under 6xxxxx (BIAYA USAHA / operating expenses).
const COA_LIST = `
100000 AKTIVA
110000 AKTIVA LANCAR
111000 KAS DAN SETARA KAS
111101 Kas
111201 BCA IDR
111202 Mandiri IDR 1410025104027
111203 Mandiri USD 1410025104068
111204 BCA USD
111298 Deposit Pajak
111299 Ayat Silang
112000 PIUTANG
112101 Piutang Usaha
112102 Piutang Karyawan
112103 Piutang Pihak Ketiga
112104 Piutang Direksi
112199 Piutang Lain-Lain
113000 UANG MUKA
113101 Uang Muka Pembelian Aktiva
113599 Uang Muka Pembelian Lain-Lain
114000 BIAYA DIBAYAR DI MUKA
114101 Asuransi Dibayar Di Muka
114102 Sewa Dibayar Di Muka
114103 Biaya Dibayar Di Muka
115000 PAJAK DIBAYAR DI MUKA
115101 Pph-21 Dibayar Di Muka
115102 Pph-22 Dibayar Di Muka
115103 Pph-23 Dibayar Di Muka
115104 Pph-25 Dibayar Di Muka
115105 Pph Final 4(2) Dibayar Di Muka
115106 PPN Masukan
120000 AKTIVA TIDAK LANCAR
121000 HARGA PEROLEHAN
121100 Tanah
121200 Bangunan
121300 Kendaraan
121400 Mesin Dan Peralatan
121500 Inventaris Kantor
122000 AKUMULASI PENYUSUTAN
122100 Ak. Penyusutan Bangunan
122200 Ak. Penyusutan Kendaraan
122300 Ak. Penyusutan Mesin Dan Peralatan
122400 Ak. Penyusutan Inventaris Kantor
200000 PASIVA
210000 KEWAJIBAN
211000 HUTANG
211101 Hutang Usaha
211102 Hutang Bank
211103 Hutang Kredit Aktiva
211104 Hutang Pihak Ketiga
211105 Hutang Direksi
211199 Hutang Lain-Lain
212000 UANG MUKA PENJUALAN
212101 Uang Muka Pendapatan
211299 Uang Muka Lain-Lain
213000 BIAYA YMH DIBAYAR
213101 Hutang Gaji
213102 Hutang Biaya
213103 Biaya YMH dibayar
214000 HUTANG PAJAK
214101 Hutang Pajak Pph-21
214102 Hutang Pajak Pph-22
214103 Hutang Pajak Pph-23
214104 Hutang Pajak Pph-25
214105 Hutang Pajak Pph-29
214106 Hutang Pajak Pph 4(2)
214107 Hutang Pajak PPN
300000 EKUITAS
311000 Modal Disetor
312000 Laba Ditahan
313000 Dividen
314101 Laba (Rugi) Tahun Berjalan
314102 Laba (Rugi) Bulan Berjalan
410000 PENDAPATAN
411101 Pendapatan Jasa Konstruksi
411102 Pendapatan Jasa Lainnya
411103 Pendapatan Sewa Bangunan
411104 Penjualan Aktiva Tetap
600000 BIAYA USAHA
611101 Upah Tenaga Kerja
611102 Gaji, Tunjangan, Lembur, THR Karyawan
611103 Imbalan Bukan Pegawai
611104 Pesangon
611105 BPJS Ketenagakerjaan
611106 BPJS Kesehatan
611107 Pengobatan
611108 Makan/Minum Pegawai
611109 Biaya Survei dan Persiapan Lahan
611110 Biaya Mobilisasi Alat
611111 Biaya Sewa Alat dan Kendaraan
611112 Biaya Perjalanan Dinas
611113 Biaya BBM, Tol, Parkir dan Restribusi
611114 Biaya Telpon dan Internet
611115 Biaya Listrik
611116 Biaya PDAM
611117 Biaya Rumah Tangga Kantor
611118 Biaya Perlengkapan Kantor
611119 Biaya Pemeliharaan Bangunan
611120 Biaya Pemeliharaan Kendaraan
611121 Biaya Pemeliharaan Inventaris
611122 Biaya Penyusutan Bangunan
611123 Biaya Penyusutan Kendaraan
611124 Biaya Penyusutan Mesin dan Peralatan
611125 Biaya Penyusutan Inventaris
611126 Biaya Perijinan
611127 Biaya Jasa Konsultan & Notaris
611128 Biaya Asuransi
611129 Biaya Pajak
611130 Biaya Sumbangan & Entertainment
611131 Biaya Leasing
611132 Biaya Sewa Bangunan
611199 Biaya Lain-Lain Operasional
700000 PENDAPATAN DAN BIAYA LAIN-LAIN
711000 PENDAPATAN LAIN-LAIN
711101 Pendapatan Jasa Giro
711102 Laba (Rugi) Selisih Kurs
711199 Pendapatan Lain-Lain
721000 BIAYA LAIN-LAIN
721101 Pajak Jasa Giro
721102 Biaya Adm Bank Dan Provisi
721103 Biaya Bunga Pinjaman Bank
721104 Biaya Bunga Kredit Aktiva
721105 Selisih Pembulatan
721106 Nilai Buku Penjualan Aktiva Tetap
721199 Biaya Lain-Lain Non Operasional
`.trim()

// Built directly from COA_LIST above, so there's only one copy of this data
// to maintain — no separate lookup file to keep in sync.
const COA_NAME_BY_CODE = Object.fromEntries(
  COA_LIST.split('\n').map((line) => {
    const [code, ...rest] = line.trim().split(' ')
    return [code, rest.join(' ')]
  })
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set')
    return res.status(500).json({ error: 'Server misconfigured: missing API key' })
  }

  const { image, mediaType } = req.body || {}

  if (!image) {
    console.error('No image received in request body')
    return res.status(400).json({ error: 'No image provided' })
  }

  const prompt = `Read this receipt photo and return ONLY a JSON object, no other text, in this exact shape:
{
  "merchant": string,
  "date": string (YYYY-MM-DD),
  "total": number,
  "category": string,
  "coa": string (a 6-digit code from the chart of accounts below),
  "items": [ { "name": string, "price": number } ]
}

Chart of accounts (code, then name) — pick the single best-fitting code for this purchase.
Most everyday purchases fall under a 611xxx code (operating expenses). Use your best judgment;
if nothing fits well, use 611199 (Biaya Lain-Lain Operasional).

${COA_LIST}
For "category", pick the single best-fitting word or short phrase with no spaces describing the purchase type (e.g. Groceries, Dining, Transport, Utilities, Shopping, Health, Entertainment, Office, Other).
All monetary amounts are in Indonesian Rupiah (IDR) — return them as plain numbers (e.g. 45000, not "Rp45.000" or 45.000).
If a field is unreadable, use null. Do not include markdown fences.`

  let response
  try {
    response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { inline_data: { mime_type: mediaType || 'image/jpeg', data: image } },
                { text: prompt }
              ]
            }
          ]
        })
      }
    )
  } catch (err) {
    console.error('Fetch to Gemini API threw:', err)
    return res.status(502).json({ error: 'Could not reach Gemini API' })
  }

  const data = await response.json()

  if (!response.ok) {
    // Surfaces the real reason: bad API key, quota exceeded, invalid request, etc.
    console.error('Gemini API returned an error:', response.status, JSON.stringify(data))
    return res.status(502).json({ error: 'Gemini API error', detail: data })
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''

  if (!text) {
    console.error('Gemini API returned no text content:', JSON.stringify(data))
    return res.status(502).json({ error: 'No content returned from Gemini' })
  }

  const clean = text.replace(/```json|```/g, '').trim()

  try {
    const parsed = JSON.parse(clean)
    parsed.coaName = COA_NAME_BY_CODE[parsed.coa] || ''
    return res.status(200).json(parsed)
  } catch (err) {
    console.error('Failed to parse model output as JSON:', text)
    return res.status(500).json({ error: 'Could not parse receipt', raw: text })
  }
}
