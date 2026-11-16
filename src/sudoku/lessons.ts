import content from './learn-content.json' with { type: 'json' }
import { lessonCatalog, type LearnContent } from './lesson-content.ts'

const { overview, fundamentals, groups } = content as LearnContent
export const learnOverview = overview
export const learnFundamentals = fundamentals
export const lessonGroups = groups
export const { articles, lessons, lessonRoutes, lessonExampleIds } = lessonCatalog({ fundamentals, groups })

export type { Drill, LessonArticle, LessonBlock } from './lesson-content'
