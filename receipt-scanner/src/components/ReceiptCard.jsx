export default function ReceiptCard({ receipt = {} }) {
  const { merchant, date, total, items = [], status, thumbUrl } = receipt

  const topItem = items.reduce(
    (best, item) => (item.price > (best?.price ?? -Infinity) ? item : best),
    null
  )

  return (
    <div className="receipt-card">
      {thumbUrl && <img className="thumb" src={thumbUrl} alt="" />}
      <div className="row">
        <span className="label">Merchant</span>
        <span className="value">{merchant || '—'}</span>
      </div>
      <div className="row">
        <span className="label">Date</span>
        <span className="value">{date || '—'}</span>
      </div>
      {topItem && (
        <div className="row">
          <span className="label">Top item: {topItem.name}</span>
          <span className="value">{formatMoney(topItem.price)}</span>
        </div>
      )}
      <div className="row total-row">
        <span>Total</span>
        <span>{formatMoney(total)}</span>
      </div>
      <span className={`status ${status}`}>
        {status === 'pending' && 'SAVING…'}
        {status === 'synced' && 'SAVED TO DRIVE + SHEET'}
        {status === 'error' && 'FAILED — TAP TO RETRY'}
      </span>
    </div>
  )
}

function formatMoney(value) {
  if (value === undefined || value === null || value === '') return '—'
  const n = Number(value)
  if (Number.isNaN(n)) return value
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(n)
}
