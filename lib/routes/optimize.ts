/**
 * Pure TSP heuristics for the route optimiser. NO server-only deps — runs on the
 * client so it can score/optimise directly against the driving matrix the map
 * planner already holds (index 0 = home, 1..n = located stops), keeping the
 * "time saved" figures consistent with the day-plan ETAs shown on screen.
 *
 * Used as the fallback when the OSRM `trip` service is unavailable, and to score
 * any ordering (current or proposed) for the savings comparison.
 */

/**
 * Total round-trip driving minutes for a visit order, anchored at home:
 * `home → order[0] → … → order[last] → home`. `order` holds MATRIX indices
 * (1..n); index 0 is home.
 */
export function tourCost(durations: number[][], order: number[]): number {
  if (order.length === 0) return 0
  let cost = durations[0]?.[order[0]] ?? 0
  for (let k = 0; k < order.length - 1; k++) {
    cost += durations[order[k]]?.[order[k + 1]] ?? 0
  }
  cost += durations[order[order.length - 1]]?.[0] ?? 0
  return cost
}

/**
 * Nearest-neighbour construction + 2-opt improvement over the driving matrix.
 * Home (matrix index 0) is fixed as start and end. Returns the optimal visiting
 * order as 0-based indices into the located-stops array (i.e. matrixIndex − 1).
 */
export function optimizeFromMatrix(durations: number[][]): number[] {
  const n = durations.length - 1 // number of stops (excluding home)
  if (n <= 0) return []
  if (n === 1) return [0]

  // Nearest-neighbour from home.
  const visited = new Set<number>([0])
  let current = 0
  let order: number[] = []
  while (order.length < n) {
    let best = -1
    let bestDist = Number.POSITIVE_INFINITY
    for (let j = 1; j <= n; j++) {
      if (visited.has(j)) continue
      const d = durations[current]?.[j] ?? Number.POSITIVE_INFINITY
      if (d < bestDist) {
        bestDist = d
        best = j
      }
    }
    if (best === -1) break
    order.push(best)
    visited.add(best)
    current = best
  }

  // 2-opt: reverse segments while it reduces the round-trip cost.
  let improved = true
  let guard = 0
  while (improved && guard < 50) {
    improved = false
    guard++
    for (let i = 0; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const candidate = order.slice(0, i).concat(order.slice(i, k + 1).reverse(), order.slice(k + 1))
        if (tourCost(durations, candidate) < tourCost(durations, order) - 1e-9) {
          order = candidate
          improved = true
        }
      }
    }
  }

  // Convert matrix indices (1..n) → located-stop indices (0-based).
  return order.map((mi) => mi - 1)
}
