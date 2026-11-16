import type { Difficulty } from './engine'
import techniqueDifficultiesJson from './generated/lesson-difficulties.json?raw'

export const techniqueDifficulties: Readonly<Partial<Record<string, Difficulty>>> = JSON.parse(techniqueDifficultiesJson)
