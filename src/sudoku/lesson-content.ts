import type { BoardRegion } from '../components/BoardAnnotations'

type Reference = { label: string; href: string }
export type Drill = { example: string; title: string }
type DiagramCopy = {
  description?: string
  reason?: string
  results?: string[]
  patternLabel?: string
  accentLabel?: string
  strongLabel?: string
  weakLabel?: string
  proofTitle?: string
  trace?: { assumption: string; steps: string[]; conclusion: string }[]
}
export type LessonBlock =
  | { type: 'text'; paragraphs: string[] }
  | { type: 'heading'; id: string; title: string }
  | { type: 'list'; items: string[] }
  | { type: 'diagram'; example: string; region?: BoardRegion; copy?: DiagramCopy }
  | { type: 'practice'; drills: Drill[]; title?: string; selectLabel?: string; instruction?: string }

export type LessonArticle = {
  id: string
  title: string
  summary: string
  blocks: LessonBlock[]
  references: Reference[]
  referencesTitle?: string
  credits?: Reference[]
  creditsPrefix?: string
}

export type LearnContent = {
  overview: {
    pageTitle: string
    title: string
    intro: string
    difficultyTitle: string
    difficultyParagraphs: string[]
    fundamentalsNote: string
  }
  fundamentals: LessonArticle
  groups: { title: string; overview: string; lessons: LessonArticle[] }[]
}

export function lessonCatalog({ fundamentals, groups }: Pick<LearnContent, 'fundamentals' | 'groups'>) {
  const lessons = groups.flatMap((group) => group.lessons)
  const articles = [fundamentals, ...lessons]
  const lessonRoutes = new Map<string, LessonArticle>()
  const lessonExampleIds = new Set<string>()

  for (const lesson of articles) {
    lessonRoutes.set(lesson.id, lesson)
    for (const block of lesson.blocks) {
      if (block.type === 'diagram') lessonExampleIds.add(block.example)
      if (block.type === 'practice') {
        for (const { example } of block.drills) {
          lessonExampleIds.add(example)
          if (lesson !== fundamentals) lessonRoutes.set(example, lesson)
        }
      }
    }
  }
  return { articles, lessons, lessonRoutes, lessonExampleIds }
}
