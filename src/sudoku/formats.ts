const GRID = /^[0-9.]{81}$/

export const STARTER = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'

export function parsePuzzle(input: string): string {
  const text = input.trim()
  if (text.length > 10_000) throw new Error('Paste one puzzle at a time.')

  let cells: string
  if (/^https?:\/\//i.test(text)) {
    const url = new URL(text)
    const host = url.hostname.replace(/^www\./, '')
    if (url.hash.startsWith('#puzzle=')) {
      cells = new URLSearchParams(url.hash.slice(1)).get('puzzle') ?? ''
    } else if (host === 'sudokuexchange.com' && /^\/play\/?$/.test(url.pathname)) {
      cells = url.searchParams.get('s') ?? ''
    } else if (host === 'sudoku.coach') {
      cells = url.pathname.match(/^\/(?:[a-z]{2}\/)?play\/([0-9.]{81})\/?$/)?.[1] ?? ''
    } else {
      throw new Error('This link format is unsupported. Try pasting the puzzle’s 81-character givens.')
    }
  } else if (text.startsWith(':')) {
    const fields = text.split(':')
    const givens = fields[3] ?? ''
    if ((fields.length !== 7 && fields.length !== 8) || /[\r\n]/.test(text) || !/^(?:[0-9.]|\+[1-9]){81}$/.test(givens)) {
      throw new Error('This HoDoKu library line is missing a valid givens field.')
    }
    // HoDoKu prefixes player-entered values with a plus sign.
    cells = givens.replace(/\+[1-9]/g, '.')
  } else {
    cells = textGridCells(text)
  }

  if (!GRID.test(cells)) {
    throw new Error('Enter exactly 81 cells. Use a dot or 0 for each empty cell.')
  }
  return cells.replace(/\./g, '0')
}

export function textGridCells(text: string): string {
  return text.split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ''))
    .filter((line) => !/^[\s+|:.'\-┌┬┐├┼┤└┴┘─│┏┳┓┣╋┫┗┻┛━┃]*[-─━][\s+|:.'\-┌┬┐├┼┤└┴┘─│┏┳┓┣╋┫┗┻┛━┃]*$/.test(line))
    .join('')
    .replace(/[\s|│┃]/g, '')
}

export type ShareFormat = 'givens' | 'grid' | 'hodoku' | 'exchange' | 'coach'

export function exportPuzzle(givens: string, format: ShareFormat, size = 9): string {
  const dots = givens.replace(/0/g, '.')
  switch (format) {
    case 'givens': return dots
    case 'grid': return dots.match(new RegExp(`.{${size}}`, 'g'))?.join('\n') ?? ''
    case 'hodoku': return `:0000:x:${dots}:::`
    case 'exchange': return `https://sudokuexchange.com/play/?s=${givens}`
    case 'coach': return `https://sudoku.coach/en/play/${givens}`
  }
}
