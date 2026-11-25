import type { EquationOperator, SizedConstraintRule } from './engine.ts'

export type RowEquationRule = Extract<SizedConstraintRule, { type: 'row-equation' }>

export const ROW_EQUATION_MAX_CELLS = 5
export const ROW_EQUATION_DESCRIPTION = 'Each outlined row segment forms an equation. Two cells joined without a sign form a two-digit number. Multiply and divide before adding and subtracting.'

export const equationSigns = {
  join: '',
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  equals: '=',
} satisfies Record<EquationOperator, string>

export const equationWords = {
  join: 'followed by',
  add: 'plus',
  subtract: 'minus',
  multiply: 'times',
  divide: 'divided by',
  equals: 'equals',
} satisfies Record<EquationOperator, string>

export function validRowEquation(rule: RowEquationRule, size: number) {
  if (Object.keys(rule).length !== 3 || !Array.isArray(rule.cells) || !Array.isArray(rule.operators) ||
    rule.cells.length < 3 || rule.cells.length > ROW_EQUATION_MAX_CELLS ||
    rule.operators.length !== rule.cells.length - 1) return false
  const first = rule.cells[0]
  return Array.from(rule.cells).every((cell, index) =>
    Number.isInteger(cell) && cell >= 0 && cell < size ** 2 && cell === first + index &&
    Math.floor(cell / size) === Math.floor(first / size)) &&
    Array.from(rule.operators).every((operator, index) => typeof operator === 'string' &&
      Object.hasOwn(equationSigns, operator) && !(operator === 'join' && rule.operators[index - 1] === 'join')) &&
    rule.operators.filter(operator => operator === 'equals').length === 1
}

export function rowEquationText(rule: RowEquationRule, size: number) {
  const at = (cell: number) => `R${Math.floor(cell / size) + 1}C${cell % size + 1}`
  return rule.operators.reduce((text, operator, index) =>
    `${text} ${equationWords[operator]} ${at(rule.cells[index + 1])}`, at(rule.cells[0]))
}

function exactValue(digits: readonly number[], operators: readonly EquationOperator[]): [number, number] {
  let sum = 0
  let sumDenominator = 1
  let term = 0
  let termDenominator = 1
  let operand = digits[0]
  let pending: EquationOperator = 'add'
  for (const [index, operator] of [...operators, 'add' as const].entries()) {
    if (operator === 'join') {
      operand = 10 * operand + digits[index + 1]
      continue
    }
    if (pending === 'multiply') term *= operand
    else if (pending === 'divide') termDenominator *= operand
    else {
      term = pending === 'subtract' ? -operand : operand
      termDenominator = 1
    }
    if (operator === 'add' || operator === 'subtract') {
      sum = sum * termDenominator + term * sumDenominator
      sumDenominator *= termDenominator
    }
    pending = operator
    operand = digits[index + 1]
  }
  return [sum, sumDenominator]
}

export function rowEquationConflict(rule: RowEquationRule, values: string, valueOffset: number) {
  const digits = rule.cells.map(cell => Number.parseInt(values[cell] ?? '0', 36) - valueOffset)
  const blank = -valueOffset
  for (const [index, operator] of rule.operators.entries()) {
    const lhs = digits[index]
    const rhs = digits[index + 1]
    if (operator === 'join' && (lhs !== blank && (lhs < 1 || lhs > 9) || rhs > 9)) return true
    if (operator === 'divide' && rhs !== blank && rhs === 0) return true
  }
  if (digits.includes(blank)) return false
  const split = rule.operators.indexOf('equals')
  const [left, leftDenominator] = exactValue(digits.slice(0, split + 1), rule.operators.slice(0, split))
  const [right, rightDenominator] = exactValue(digits.slice(split + 1), rule.operators.slice(split + 1))
  return leftDenominator === 0 || rightDenominator === 0 || left * rightDenominator !== right * leftDenominator
}
