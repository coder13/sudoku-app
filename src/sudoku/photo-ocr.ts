import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import workerPath from 'tesseract.js/dist/worker.min.js?url'
import corePath from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url'
import modelPath from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url'
import { photoCell } from './photo-image'

const SINGLE_DIGIT = /^[1-9]$/
const LINE_RETRY = { rotateAuto: false, tessedit_pageseg_mode: PSM.SINGLE_LINE }
const RAW_RETRY = { rotateAuto: false, tessedit_pageseg_mode: PSM.RAW_LINE }

async function openWorker(signal: AbortSignal): Promise<Worker> {
  signal.throwIfAborted()
  let abandoned = false
  let rejectStart!: (reason: unknown) => void
  const failed = new Promise<never>((_, reject) => { rejectStart = reject })
  const abort = () => rejectStart(signal.reason)
  const timeout = window.setTimeout(() => rejectStart(new Error('OCR initialization timed out')), 20_000)
  signal.addEventListener('abort', abort, { once: true })
  try {
    const starting = createWorker('eng', OEM.LSTM_ONLY, {
      workerPath,
      corePath,
      langPath: new URL('.', new URL(modelPath, window.location.href)).href,
      workerBlobURL: false,
      cacheMethod: 'none',
      errorHandler: rejectStart,
    }).then(async worker => {
      if (abandoned) await worker.terminate()
      return worker
    })
    return await Promise.race([starting, failed])
  } catch (reason) {
    abandoned = true
    throw reason
  } finally {
    window.clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
  }
}

export async function readPuzzlePhoto(pixels: Uint8ClampedArray, signal: AbortSignal) {
  const cells = Array.from({ length: 81 }, (_, index) => photoCell(pixels, index))
  const review = new Set(cells.flatMap(({ review }, index) => review ? [index] : []))
  const givens = Array<string>(81).fill('0')
  if (!cells.some(cell => cell.canvas)) {
    throw new Error('No digits were found. Check the crop or try a clearer image.')
  }

  let worker: Worker | undefined
  try {
    worker = await openWorker(signal)
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_CHAR,
      tessedit_char_whitelist: '123456789',
      user_defined_dpi: '300',
    })
    for (const [index, cell] of cells.entries()) {
      signal.throwIfAborted()
      if (!cell.canvas) continue
      let { data } = await worker.recognize(cell.canvas)
      const first = data.text.trim()
      if (!SINGLE_DIGIT.test(first) || data.confidence < 85) {
        signal.throwIfAborted()
        const alternative = (await worker.recognize(cell.alternate(), LINE_RETRY)).data
        const second = alternative.text.trim()
        if (second !== first) review.add(index)
        if (SINGLE_DIGIT.test(second) && (!SINGLE_DIGIT.test(first) || alternative.confidence > data.confidence)) data = alternative
      }
      if (!SINGLE_DIGIT.test(data.text.trim()) || data.confidence < 76) {
        signal.throwIfAborted()
        const alternative = (await worker.recognize(cell.grayscale(), RAW_RETRY)).data
        const digit = alternative.text.trim()
        if (digit !== data.text.trim()) review.add(index)
        if (SINGLE_DIGIT.test(digit) && (!SINGLE_DIGIT.test(data.text.trim()) || alternative.confidence > data.confidence)) data = alternative
      }
      const digit = data.text.trim()
      if (SINGLE_DIGIT.test(digit)) givens[index] = digit
      if (data.confidence < 75) review.add(index)
    }
  } catch {
    signal.throwIfAborted()
    throw new Error('The digit reader could not finish. Try scanning the image again.')
  } finally {
    await worker?.terminate()
  }
  return { givens, review }
}
