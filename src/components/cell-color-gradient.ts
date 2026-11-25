/** Build equal color slices around a cell center, so two or more marks meet in the middle. */
export function cellColorGradient(fills: readonly string[]) {
  if (fills.length < 2) return undefined
  const stops = fills.map((fill, index) => {
    const start = index * 100 / fills.length
    const end = (index + 1) * 100 / fills.length
    return `${fill} ${start}% ${end}%`
  })
  return `conic-gradient(from 45deg at 50% 50%, ${stops.join(', ')})`
}
