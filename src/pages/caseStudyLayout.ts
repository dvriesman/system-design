// Layout and line routing for the case study diagram: no React here, so it can be tested on its own.
// Nodes sit on a grid of columns and rows. Unused rows collapse, and every line is routed so that it never passes behind a box.

export type Kind = 'client' | 'edge' | 'service' | 'db' | 'cache' | 'queue' | 'stream' | 'external' | 'storage' | 'search' | 'warehouse' | 'security'

export type DiagramNode = {
  id: string
  kind: Kind
  title: string
  sub?: string
  col: number
  row: number
  rowEnd?: number
  colEnd?: number
  why: string
  tradeoff: string
}
// purpose says what flows along the line, and is shown when either end is selected.
export type DiagramEdge = { from: string; to: string; async?: boolean; label?: string; purpose?: string }
// A zone is drawn as one dashed box around its members, or, with outline, as a dashed outline around each member.
export type Zone = { id: string; title: string; members: string[]; outline?: boolean }

export type Box = { x: number; y: number; w: number; h: number }
type Point = { x: number; y: number }

const COL_X = [20, 200, 385, 575, 765, 955]
const COL_W = 155
const ROW_H = 98
const BOX_H = 66
const TOP = 34
export const DIAGRAM_WIDTH = 1130

export function layout(nodes: DiagramNode[]): { boxes: Map<string, Box>; height: number } {
  const used = new Set<number>()
  for (const n of nodes) {
    used.add(n.row)
    if (n.rowEnd !== undefined) used.add(n.rowEnd)
  }
  const rows = [...used].sort((a, b) => a - b)
  const rank = new Map(rows.map((r, i) => [r, i]))
  // A spanning node ends on the last used row inside its range.
  const lastUsed = (from: number, to: number) => rows.filter((r) => r >= from && r <= to).pop() ?? from
  const boxes = new Map<string, Box>()
  for (const n of nodes) {
    const top = TOP + rank.get(n.row)! * ROW_H
    const endRow = n.rowEnd !== undefined ? lastUsed(n.row, n.rowEnd) : n.row
    const bottom = TOP + rank.get(endRow)! * ROW_H + BOX_H
    const x = COL_X[n.col]
    const right = COL_X[n.colEnd ?? n.col] + COL_W
    boxes.set(n.id, { x, y: top, w: right - x, h: bottom - top })
  }
  const height = TOP + rows.length * ROW_H + 10
  return { boxes, height }
}

const center = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

type Side = 'left' | 'right' | 'top' | 'bottom'
const SIDES: Side[] = ['left', 'right', 'top', 'bottom']

function port(b: Box, side: Side, toward: Point): { at: Point; out: Point } {
  const STUB = 12
  // A tall or wide box gets its port opposite the other end, so lines don't all meet at one point.
  if (side === 'left' || side === 'right') {
    const y = b.h > BOX_H + 10 ? Math.min(b.y + b.h - 14, Math.max(b.y + 14, toward.y)) : b.y + b.h / 2
    const x = side === 'left' ? b.x : b.x + b.w
    return { at: { x, y }, out: { x: side === 'left' ? x - STUB : x + STUB, y } }
  }
  const x = b.w > COL_W + 10 ? Math.min(b.x + b.w - 14, Math.max(b.x + 14, toward.x)) : b.x + b.w / 2
  const y = side === 'top' ? b.y : b.y + b.h
  return { at: { x, y }, out: { x, y: side === 'top' ? y - STUB : y + STUB } }
}

function crosses(a: Point, b: Point, box: Box, pad: number) {
  const left = box.x - pad
  const right = box.x + box.w + pad
  const top = box.y - pad
  const bottom = box.y + box.h + pad
  if (a.x === b.x) {
    if (a.x <= left || a.x >= right) return false
    return Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom
  }
  if (a.y === b.y) {
    if (a.y <= top || a.y >= bottom) return false
    return Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right
  }
  return true
}

type Segment = { a: Point; b: Point }

function crossesSegment(s: Segment, t: Segment) {
  const sv = s.a.x === s.b.x
  const tv = t.a.x === t.b.x
  if (sv === tv) return false
  const v = sv ? s : t
  const h = sv ? t : s
  const x = v.a.x
  const y = h.a.y
  return x > Math.min(h.a.x, h.b.x) + 1 && x < Math.max(h.a.x, h.b.x) - 1 && y > Math.min(v.a.y, v.b.y) + 1 && y < Math.max(v.a.y, v.b.y) - 1
}

function overlapLength(s: Segment, t: Segment) {
  if (s.a.x === s.b.x && t.a.x === t.b.x && Math.abs(s.a.x - t.a.x) < 3) {
    return Math.max(0, Math.min(Math.max(s.a.y, s.b.y), Math.max(t.a.y, t.b.y)) - Math.max(Math.min(s.a.y, s.b.y), Math.min(t.a.y, t.b.y)))
  }
  if (s.a.y === s.b.y && t.a.y === t.b.y && Math.abs(s.a.y - t.a.y) < 3) {
    return Math.max(0, Math.min(Math.max(s.a.x, s.b.x), Math.max(t.a.x, t.b.x)) - Math.max(Math.min(s.a.x, s.b.x), Math.min(t.a.x, t.b.x)))
  }
  return 0
}

function simplify(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    if (out.length >= 2) {
      const prev = out[out.length - 2]
      if ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y)) out.pop()
    }
    out.push(p)
  }
  return out
}

export type Routed = { edge: DiagramEdge; points: Point[]; clear: boolean }

// Tries orthogonal paths through the gaps between columns and rows, shortest first, and keeps one that touches no other box.
export function route(edges: DiagramEdge[], boxes: Map<string, Box>, height: number): Routed[] {
  const all = [...boxes.entries()]
  const gapsX = [COL_X[0] - 10, ...COL_X.slice(1).map((x, i) => (COL_X[i] + COL_W + x) / 2), COL_X[COL_X.length - 1] + COL_W + 10]
  const ys = [...new Set(all.map(([, b]) => b.y))].sort((a, b) => a - b)
  const gapsY = [ys[0] - 14, ...ys.slice(1).map((y) => y - (ROW_H - BOX_H) / 2), height - 4]
  const placed: Segment[] = []

  const distance = (e: DiagramEdge) => {
    const a = center(boxes.get(e.from)!)
    const b = center(boxes.get(e.to)!)
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  }
  const order = edges.map((e, i) => ({ e, i })).sort((x, y) => distance(x.e) - distance(y.e))
  const results: Routed[] = new Array(edges.length)
  for (const { e, i } of order) results[i] = routeOne(e)
  return results

  function routeOne(edge: DiagramEdge): Routed {
    const a = boxes.get(edge.from)!
    const b = boxes.get(edge.to)!
    const obstacles = all.filter(([id]) => id !== edge.from && id !== edge.to).map(([, box]) => box)
    const candidates: { points: Point[]; cost: number }[] = []
    for (const sa of SIDES) {
      for (const sb of SIDES) {
        const p = port(a, sa, center(b))
        const q = port(b, sb, center(a))
        const middles: Point[][] = [
          [{ x: q.out.x, y: p.out.y }],
          [{ x: p.out.x, y: q.out.y }],
          ...gapsX.map((x) => [{ x, y: p.out.y }, { x, y: q.out.y }]),
          ...gapsY.map((y) => [{ x: p.out.x, y }, { x: q.out.x, y }]),
          ...gapsX.flatMap((x) => gapsY.map((y) => [{ x, y: p.out.y }, { x, y }, { x: q.out.x, y }])),
          ...gapsY.flatMap((y) => gapsX.map((x) => [{ x: p.out.x, y }, { x, y }, { x, y: q.out.y }])),
        ]
        for (const middle of middles) {
          const points = simplify([p.at, p.out, ...middle, q.out, q.at])
          let length = 0
          for (let i = 0; i + 1 < points.length; i++) length += Math.abs(points[i].x - points[i + 1].x) + Math.abs(points[i].y - points[i + 1].y)
          candidates.push({ points, cost: length + points.length * 26 })
        }
      }
    }
    candidates.sort((x, y) => x.cost - y.cost)
    let best: { points: Point[]; score: number } | null = null
    let found = 0
    for (const { points, cost } of candidates) {
      if (best && cost > best.score) break
      let ok = true
      let shared = 0
      let crossings = 0
      for (let i = 0; i + 1 < points.length && ok; i++) {
        const s = points[i]
        const t = points[i + 1]
        if (s.x !== t.x && s.y !== t.y) ok = false
        else if (obstacles.some((box) => crosses(s, t, box, 4))) ok = false
        // The middle of the path must not run back through its own two boxes.
        else if (i > 0 && i + 2 < points.length && (crosses(s, t, a, 1) || crosses(s, t, b, 1))) ok = false
        else {
          shared += placed.reduce((sum, seg) => sum + overlapLength({ a: s, b: t }, seg), 0)
          crossings += placed.filter((seg) => crossesSegment({ a: s, b: t }, seg)).length
        }
      }
      if (!ok) continue
      const score = cost + shared * 8 + crossings * 15
      if (!best || score < best.score) best = { points, score }
      if (++found >= 24) break
    }
    if (!best) return { edge, points: [center(a), center(b)], clear: false }
    for (let i = 0; i + 1 < best.points.length; i++) placed.push({ a: best.points[i], b: best.points[i + 1] })
    return { edge, points: best.points, clear: true }
  }
}
