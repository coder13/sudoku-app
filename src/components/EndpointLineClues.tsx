import { EndpointPath } from './EndpointPath'

/** Draw lines and shared end markers for one endpoint rule in a grid-sized SVG. */
export function EndpointLineClues({ paths, size, kind }: {
  paths: readonly (readonly number[])[]
  size: number
  kind: 'between' | 'lockout'
}) {
  if (!paths.length) return null
  const lockout = kind === 'lockout'
  const center = (cell: number) => [cell % size + .5, Math.floor(cell / size) + .5] as const
  const endpoints = new Set(paths.flatMap(path => [path[0], path.at(-1)!]))
  return <g className={lockout ? 'number-puzzle-lockout' : undefined}>
    <g className={`variant-${kind}`}>
      {paths.map((path, index) => <EndpointPath key={index} path={path.map(center)} />)}
    </g>
    <g className={`variant-${kind}-endpoints`}>
      {[...endpoints].map(cell => {
        const [x, y] = center(cell)
        return lockout ? <path key={cell} d={`M${x},${y - .36}l.36,.36l-.36,.36l-.36,-.36Z`} />
          : <circle key={cell} cx={x} cy={y} r=".32" />
      })}
    </g>
  </g>
}
