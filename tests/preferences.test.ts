import assert from 'node:assert/strict'
import { test } from 'node:test'
import { APPEARANCE_KEY, PUZZLE_BORDER_WIDTHS, readPreferences } from '../src/sudoku/preferences.ts'
import {
  clampGridTextScale,
  DEFAULT_GRID_TEXT_SCALE,
  gridTextScalePercentage,
  MAX_GRID_TEXT_SCALE,
  MIN_GRID_TEXT_SCALE,
  stepGridTextScale,
} from '../src/sudoku/grid-text-scale.ts'

test('puzzle text size treats the largest visual scale as 100%', () => {
  assert.equal(MAX_GRID_TEXT_SCALE, 1.5)
  assert.equal(gridTextScalePercentage(MAX_GRID_TEXT_SCALE), 100)
})

test('puzzle text size defaults to 75%', () => {
  assert.equal(gridTextScalePercentage(DEFAULT_GRID_TEXT_SCALE), 75)
})

test('puzzle text scale remains bounded by the supported visual sizes', () => {
  assert.equal(clampGridTextScale(0), MIN_GRID_TEXT_SCALE)
  assert.equal(clampGridTextScale(2), MAX_GRID_TEXT_SCALE)
})

test('five increases move the 75% default to the exact 100% endpoint', () => {
  let scale = DEFAULT_GRID_TEXT_SCALE
  for (let step = 0; step < 5; step++) scale = stepGridTextScale(scale, 1)
  assert.equal(scale, MAX_GRID_TEXT_SCALE)
})

test('puzzle borders accept supported widths and keep the default for older or invalid preferences', () => {
  const read = (width: unknown) => readPreferences({
    getItem: key => key === APPEARANCE_KEY ? JSON.stringify({ puzzleBorderWidth: width }) : null,
  }).appearance.puzzleBorderWidth

  for (const width of PUZZLE_BORDER_WIDTHS) assert.equal(read(width), width)
  for (const width of [undefined, null, 0, 2.5, 7, '4']) assert.equal(read(width), 2)
})

test('mobile puzzle gestures restore saved offsets and shrink amounts', () => {
  const read = (space: unknown, shrink?: unknown) => readPreferences({
    getItem: key => key === APPEARANCE_KEY ? JSON.stringify({ mobilePuzzleTopSpace: space, mobilePuzzleShrink: shrink }) : null,
  }).appearance

  for (const space of [0, 16, 32.5, 272]) assert.equal(read(space).mobilePuzzleTopSpace, space)
  for (const space of [undefined, null, '64']) assert.equal(read(space).mobilePuzzleTopSpace, 0)
  assert.equal(read(64, 32.5).mobilePuzzleShrink, 32.5)
  assert.equal(read(64, -16).mobilePuzzleShrink, 0)
})
