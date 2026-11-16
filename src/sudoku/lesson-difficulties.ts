import { DIFFICULTY_LABELS } from './difficulty'
import type { Difficulty } from './engine'
import { lessons } from './lessons'
import { techniqueDifficulties } from './technique-difficulties'

const levels = Object.keys(DIFFICULTY_LABELS) as Difficulty[]

const lessonLevels = lessons.map((lesson) => {
  const variants = new Set(lesson.blocks.flatMap((block) =>
    block.type === 'practice' ? block.drills.map(({ example }) => techniqueDifficulties[example]) : [],
  ))
  const ordered = levels.filter((level) => variants.has(level))
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const label = first === last ? DIFFICULTY_LABELS[first] : `${DIFFICULTY_LABELS[first]} to ${DIFFICULTY_LABELS[last]}`
  return { lesson, first, label }
})

export const lessonDifficultyLabels = new Map(lessonLevels.map(({ lesson, label }) => [lesson.id, label]))

export const lessonsByDifficulty = levels.map((level) => ({
  title: DIFFICULTY_LABELS[level],
  lessons: lessonLevels.filter(({ first }) => first === level).map(({ lesson }) => lesson),
})).filter((group) => group.lessons.length)
