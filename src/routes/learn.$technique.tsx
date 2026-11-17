import { createFileRoute, notFound } from '@tanstack/react-router'
import { LearnHeading } from '../components/LearnHeading'
import { TechniqueLesson } from '../components/TechniqueLesson'
import { lessonRoutes } from '../sudoku/lessons'

export const Route = createFileRoute('/learn/$technique')({
  loader: ({ params }) => {
    if (!lessonRoutes.has(params.technique)) throw notFound()
    return params.technique
  },
  head: ({ loaderData }) => {
    const lesson = loaderData === undefined ? undefined : lessonRoutes.get(loaderData)
    return lesson ? { meta: [{ title: `${lesson.title} | Sudoku` }, { name: 'description', content: lesson.summary }] } : {}
  },
  component: LessonPage,
  notFoundComponent: () => <LearnHeading title="Technique unavailable" />,
})

export function LessonPage() {
  const variant = Route.useLoaderData()
  const lesson = lessonRoutes.get(variant)
  if (!lesson) throw notFound()
  return <TechniqueLesson key={variant} lesson={lesson} variant={variant} />
}
