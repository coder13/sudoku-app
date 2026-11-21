export function EndpointPath({ path }: { path: readonly (readonly [number, number])[] }) {
  const gap = ([x1, y1]: readonly [number, number], [x2, y2]: readonly [number, number]) =>
    Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) > 1
  if (!path.slice(1).some((point, index) => gap(path[index], point))) {
    return <polyline points={path.map(point => point.join(',')).join(' ')} />
  }
  return <>
    {path.slice(1).map(([x2, y2], index) => {
      const [x1, y1] = path[index]
      return <line key={index} className={gap([x1, y1], [x2, y2]) ? 'variant-between-jump' : undefined} {...{ x1, y1, x2, y2 }} />
    })}
    {path.slice(1, -1).map(([cx, cy], index) => <circle key={index} className="variant-between-node" {...{ cx, cy }} r=".11" />)}
  </>
}
