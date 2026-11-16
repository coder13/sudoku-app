import assert from 'node:assert/strict'
import { test } from 'node:test'
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
