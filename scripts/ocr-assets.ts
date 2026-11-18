// Tesseract appends the language filename to langPath. Keep that name inside a hashed directory.
export function ocrAssetFileNames({ names }: { names: string[] }) {
  return names.includes('eng.traineddata.gz')
    ? 'assets/ocr-[hash]/eng.traineddata.gz'
    : 'assets/[name]-[hash][extname]'
}
