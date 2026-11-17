import { DIFFICULTY_LABELS, DIFFICULTY_LEVELS } from './difficulty'
import type { Difficulty } from './engine'
import { learnFundamentals, lessonGroups, lessons } from './lessons'
import { techniqueDifficulties } from './technique-difficulties'

const levels: readonly Difficulty[] = DIFFICULTY_LEVELS

const lessonLevels = lessons.map((lesson) => {
  const variants = new Set(lesson.blocks.flatMap((block) =>
    block.type === 'practice' ? block.drills.map(({ example }) => techniqueDifficulties[example]) : [],
  ))
  const ordered = levels.filter((level) => variants.has(level))
  const first = lesson.difficulty ?? ordered[0]
  const last = ordered[ordered.length - 1] ?? first
  const label = lesson.kind === 'foundation' ? `${DIFFICULTY_LABELS[first]} foundation`
    : first === last ? DIFFICULTY_LABELS[first] : `${DIFFICULTY_LABELS[first]} to ${DIFFICULTY_LABELS[last]}`
  return { lesson, first, label }
})

export const lessonDifficultyLabels = new Map(lessonLevels.map(({ lesson, label }) => [lesson.id, label]))

const difficultyByLesson = new Map(lessonLevels.map(({ lesson, first }) => [lesson.id, first]))
const indexedGroups = lessonGroups.map((group, index) => ({ ...group, index }))

function byDifficulty(groups: typeof indexedGroups) {
  return levels.flatMap(level => {
    const families = groups.map(({ title, index, lessons }) => ({
      title, index, lessons: lessons.filter(lesson => difficultyByLesson.get(lesson.id) === level),
    })).filter(family => family.lessons.length)
    const count = families.reduce((total, family) => total + family.lessons.length, 0)
    return count ? [{ title: DIFFICULTY_LABELS[level], families, count }] : []
  })
}

export const lessonsByVariant = [
  { title: 'Classic', group: undefined, difficulties: byDifficulty(indexedGroups.filter(group => !group.variant)) },
  ...indexedGroups.filter(group => group.variant).map(group => ({
    title: group.title, group, difficulties: byDifficulty([group]),
  })),
]

export const lessonReadingOrder = [learnFundamentals, ...lessonsByVariant.flatMap(({ difficulties }) =>
  difficulties.flatMap(({ families }) => families.flatMap(({ lessons }) => lessons)))]
