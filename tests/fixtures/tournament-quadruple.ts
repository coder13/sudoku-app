import { coachCode } from '../helpers/coach-code.ts'

// Published 6 × 6 youth championship example, transcribed into Coach's wire format.
// https://logic-masters.de/DJSM/2020/dokumente/DJSM2020_Online_Quali_Anleitung.pdf#page=3
export const tournamentQuadrupleDigits = '050000600000000004000050000300002000'
export const tournamentQuadrupleSolution = '351462624513215634463251146325532146'
export const tournamentQuadrupleRules = [[3, '1456'], [8, '4556'], [13, '1356'], [18, '1446']] as const

export function tournamentQuadrupleCode() {
  return coachCode({
    gridSize: 6,
    regions: Array.from({ length: 36 }, (_, cell) => Math.floor(cell / 12) * 2 + Math.floor(cell % 6 / 3)),
    givenDigits: tournamentQuadrupleDigits,
    givenConstraints: [{ type: 'quadruple', segments: tournamentQuadrupleRules.map(([anchor, digits]) =>
      ({ cells: [anchor], parameters: { digits } })) }],
  })
}
