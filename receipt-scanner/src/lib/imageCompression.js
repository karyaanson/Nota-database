// Resizes and re-encodes a receipt photo before it's uploaded to Drive or sent
// for AI extraction. Phone cameras often produce multi-megabyte photos, which
// is overkill for a receipt — this shrinks them significantly while keeping
// text legible, both for humans viewing the Drive file and for Gemini reading it.
//
// maxDimension: the longer side is capped to this many pixels (receipts are
// mostly text, so there's no real benefit to keeping huge resolutions).
// quality: JPEG compression quality, 0–1.
// skipIfUnderBytes: if the original file is already smaller than this, it's
// left untouched — re-encoding an already-small image can make it *larger*,
// not smaller, so there's nothing to gain by compressing it further.
export async function compressImage(file, { maxDimension = 1600, quality = 0.8, skipIfUnderBytes = 300_000 } = {}) {
  if (file.size <= skipIfUnderBytes) {
    return file
  }

  const bitmap = await createImageBitmap(file)

  let { width, height } = bitmap
  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image compression failed'))),
      'image/jpeg',
      quality
    )
  })
}
