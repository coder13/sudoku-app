import assert from 'node:assert/strict'
import test from 'node:test'
import { applyActionMatches, recordAction, type ActionMatcher } from '../src/sudoku/action-history.ts'
import { createActionHistoryQueue } from '../src/sudoku/action-history-queue.ts'
import { enter, makeGame, restartGame } from '../src/sudoku/game.ts'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('appended edits do not restart a history batch and each next batch uses the latest history', async () => {
  let game = makeGame('queue', 'Test', '0'.repeat(81), 'custom')
  game = recordAction(game, enter(game, [0], 'value', 1))
  const jobs: { finish: (value: string | null) => void; closed: boolean; position?: Parameters<ActionMatcher>[0] }[] = []
  const queue = createActionHistoryQueue(() => {
    const job = { finish: (_: string | null) => {}, closed: false, position: undefined as Parameters<ActionMatcher>[0] | undefined }
    jobs.push(job)
    return {
      match: position => { job.position = position; return new Promise(resolve => { job.finish = resolve }) },
      close: () => { job.closed = true },
    }
  }, (entries, matches) => {
    game = applyActionMatches(game, entries, matches)
    return game.actionHistory ?? []
  })
  queue.update(game.actionHistory!)
  await tick()
  assert.equal(jobs.length, 1)
  const firstEntry = game.actionHistory![0]
  game = recordAction(game, enter(game, [1], 'value', 2))
  queue.update(game.actionHistory!)
  game = recordAction(game, enter(game, [2], 'value', 3))
  queue.update(game.actionHistory!)
  await tick()
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].closed, false)
  assert.equal(jobs[0].position, firstEntry.pending)
  jobs[0].finish('naked-single')
  await tick()
  await tick()
  assert.equal(jobs.length, 2)
  assert.equal(game.actionHistory![0].technique, 'naked-single')
  assert.equal(jobs[1].position, game.actionHistory![1].pending)
  jobs[1].finish('hidden-single')
  await tick()
  await tick()
  assert.equal(jobs.length, 3)
  jobs[2].finish(null)
  await tick()
  assert.ok(game.actionHistory!.every(entry => !entry.pending))
  queue.close()
})

test('restarted or abandoned history stops its matcher and cannot apply a late result', async () => {
  let game = makeGame('cancel', 'Test', '0'.repeat(81), 'custom')
  game = recordAction(game, enter(game, [0], 'value', 1))
  let applied = 0
  const jobs: { finish: (value: string | null) => void; closed: boolean }[] = []
  const queue = createActionHistoryQueue(() => {
    const job = { finish: (_: string | null) => {}, closed: false }
    jobs.push(job)
    return { match: () => new Promise(resolve => { job.finish = resolve }), close: () => { job.closed = true } }
  }, (entries, matches) => {
    applied++
    game = applyActionMatches(game, entries, matches)
    return game.actionHistory ?? []
  })
  queue.update(game.actionHistory!)
  await tick()
  game = restartGame(game)
  queue.update(game.actionHistory ?? [])
  assert.equal(jobs[0].closed, true)
  jobs[0].finish('stale')
  await tick()
  assert.equal(applied, 0)
  game = recordAction(game, enter(game, [1], 'value', 2))
  queue.update(game.actionHistory!)
  await tick()
  assert.equal(jobs.length, 2)
  queue.close()
  assert.equal(jobs[1].closed, true)
  jobs[1].finish('stale')
  await tick()
  assert.equal(applied, 0)
  assert.ok(game.actionHistory![0].pending)
})
