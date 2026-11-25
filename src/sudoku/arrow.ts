/** Exact candidate support for a bulb whose digit equals the sum along its shaft. */
export function arrowSupport(domains: readonly number[], size: number): number[] | null {
  if (domains.length < 2 || domains.some(domain => !domain)) return null
  const shaft = domains.slice(1)
  const prefix = Array.from({ length: shaft.length + 1 }, () => new Uint8Array(size + 1))
  const suffix = Array.from({ length: shaft.length + 1 }, () => new Uint8Array(size + 1))
  prefix[0][0] = 1
  for (let index = 0; index < shaft.length; index++) {
    for (let total = 0; total <= size; total++) if (prefix[index][total]) {
      for (let digit = 1; digit <= size && total + digit <= size; digit++) {
        if (shaft[index] & (1 << (digit - 1))) prefix[index + 1][total + digit] = 1
      }
    }
  }
  suffix[shaft.length][0] = 1
  for (let index = shaft.length - 1; index >= 0; index--) {
    for (let total = 0; total <= size; total++) if (suffix[index + 1][total]) {
      for (let digit = 1; digit <= size && total + digit <= size; digit++) {
        if (shaft[index] & (1 << (digit - 1))) suffix[index][total + digit] = 1
      }
    }
  }
  let bulbSupport = 0
  const shaftSupport = shaft.map(() => 0)
  for (let target = 1; target <= size; target++) {
    const targetMask = 1 << (target - 1)
    if (!(domains[0] & targetMask) || !prefix[shaft.length][target]) continue
    bulbSupport |= targetMask
    for (let index = 0; index < shaft.length; index++) for (let digit = 1; digit <= size; digit++) {
      if (!(shaft[index] & (1 << (digit - 1))) || digit > target) continue
      for (let before = 0; before + digit <= target; before++) {
        const after = target - digit - before
        if (prefix[index][before] && suffix[index + 1][after]) {
          shaftSupport[index] |= 1 << (digit - 1)
          break
        }
      }
    }
  }
  return bulbSupport ? [bulbSupport, ...shaftSupport] : null
}
