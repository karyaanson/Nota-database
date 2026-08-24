import { useRef } from 'react'

export default function CaptureButton({ onCapture, disabled }) {
  const inputRef = useRef(null)

  function handleChange(e) {
    const file = e.target.files?.[0]
    if (file) onCapture(file)
    e.target.value = '' // allow capturing the same shot twice in a row
  }

  return (
    <>
      <button
        className="capture-btn"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {disabled ? 'Reading receipt…' : '+ Scan a receipt'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden-input"
        onChange={handleChange}
      />
    </>
  )
}
