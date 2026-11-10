import { useEffect, useRef } from 'react'

// Shared by every debugger page.
//
// The simulations record each step's state AFTER its line has run. A real debugger highlights the line that is
// ABOUT to run, so these helpers show the state from before that line, and keep the screen on the running code.

// before: the variables just before this line, when a simulation knows them better than the guess below, such as
// right after a call into another actor returns.
type ViewStep<S> = { s: S; line: string | null; crash: boolean; actor: string | null; locals?: Record<string, string>; before?: Record<string, string> }
type Line = { id: string; code: string }

const ASSIGNED = /^\s*(?:val\s+|var\s+)?([A-Za-z_][\w.]*)\s*=(?!=)/

function assignedName(code: string | undefined): string | null {
  return code?.match(ASSIGNED)?.[1] ?? null
}

// True when both lines are in one pane, in order, with no new function starting between them.
function sameCall(panes: Line[][], previous: string, current: string): boolean {
  for (const lines of panes) {
    const from = lines.findIndex((l) => l.id === previous)
    const to = lines.findIndex((l) => l.id === current)
    if (from < 0 || to < 0) continue
    if (from >= to) return false
    return !lines.slice(from + 1, to + 1).some((l) => l.code.trimStart().startsWith('fun '))
  }
  return false
}

export type DebuggerView<S> = { s: S; locals: Record<string, string>; pending: boolean }

export function debuggerView<S>(steps: ViewStep<S>[], index: number, panes: Line[][] = []): DebuggerView<S> {
  const step = steps[index]
  const own = step.locals ?? {}
  // A step with no line isn't waiting to run, and a crash takes effect the moment it happens.
  if (!step.line || step.crash || index === 0) return { s: step.s, locals: own, pending: false }

  const previous = steps[index - 1]
  if (step.before) return { s: previous.s, locals: step.before, pending: true }
  const before = previous.locals ?? {}
  const continuing = previous.line !== null && !previous.crash && previous.actor === step.actor && sameCall(panes, previous.line, step.line)

  const locals: Record<string, string> = {}
  if (continuing) {
    // The same call: a variable keeps its old value, and a new one isn't declared yet.
    for (const name of Object.keys(own)) if (name in before) locals[name] = before[name]
  } else {
    // Just entering a call: its arguments exist, but not what this first line assigns.
    const code = panes.flat().find((l) => l.id === step.line)?.code
    const assigned = assignedName(code)
    for (const name of Object.keys(own)) if (name !== assigned) locals[name] = own[name]
  }
  return { s: previous.s, locals, pending: true }
}

type Snapshot = { text: string; rows: Set<string> }

function reflash(el: Element, cls: string) {
  el.classList.remove(cls)
  void (el as HTMLElement).offsetWidth
  el.classList.add(cls)
}

// Marks what changed since the last step, and returns the first panel that changed.
function markChanges(bench: HTMLElement, memory: WeakMap<Element, Snapshot>, flash: boolean): Element | null {
  let first: Element | null = null
  for (const store of bench.querySelectorAll('.sim-grid .sim-store')) {
    const text = (store as HTMLElement).innerText
    const rowEls = Array.from(store.querySelectorAll('tbody tr')) as HTMLElement[]
    const rows = new Set(rowEls.map((r) => r.innerText))
    const old = memory.get(store)
    memory.set(store, { text, rows })
    if (!flash || old?.text === text) continue
    const fresh = rowEls.filter((r) => !old?.rows.has(r.innerText))
    if (fresh.length) fresh.forEach((r) => reflash(r, 'sim-changed-row'))
    else reflash(store, 'sim-changed')
    if (!first && !store.classList.contains('sim-vars')) first = store
  }
  return first
}

function revealInColumn(col: HTMLElement, target: Element, reservedBottom: number, behavior: ScrollBehavior) {
  const area = col.getBoundingClientRect()
  const box = target.getBoundingClientRect()
  const bottom = area.bottom - reservedBottom
  if (box.top >= area.top && box.bottom <= bottom) return
  col.scrollBy({ top: box.top - area.top - Math.max(0, (bottom - area.top - box.height) / 2), behavior })
}

// Keeps the running line, the variables and whatever just changed on screen, without the page scrolling around.
export function useFollowExecution(cur: number, run: unknown) {
  const benchRef = useRef<HTMLDivElement>(null)
  const last = useRef<{ cur: number; run: unknown } | null>(null)
  const memory = useRef(new WeakMap<Element, Snapshot>())

  useEffect(() => {
    const bench = benchRef.current
    const head = bench?.querySelector<HTMLElement>('.sim-debug-head')
    if (!bench || !head) return
    const measure = () => bench.style.setProperty('--sim-head-h', `${head.offsetHeight}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(head)
    // An experiment button sits below the debugger, so take the reader back up to the result.
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element).closest('.sim-try button')) window.scrollBy({ top: bench.getBoundingClientRect().top })
    }
    bench.addEventListener('click', onClick)
    return () => {
      observer.disconnect()
      bench.removeEventListener('click', onClick)
    }
  }, [])

  useEffect(() => {
    const bench = benchRef.current
    if (!bench) return
    const previous = last.current
    last.current = { cur, run }
    const sameRun = previous?.run === run
    const changed = markChanges(bench, memory.current, sameRun && cur === (previous?.cur ?? 0) + 1)
    if (!sameRun || previous?.cur === cur) return

    const head = bench.querySelector<HTMLElement>('.sim-debug-head')
    const grid = bench.querySelector<HTMLElement>('.sim-grid')
    if (!head || !grid) return
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    const line = bench.querySelector('.sim-ln.cur')

    if (window.matchMedia('(max-width: 900px)').matches) {
      // One column: pin the controls to the top, then keep the line just below them.
      if (head.getBoundingClientRect().top > 1) window.scrollBy({ top: bench.getBoundingClientRect().top })
      if (!line) return
      const headBottom = head.getBoundingClientRect().bottom
      const box = line.getBoundingClientRect()
      if (box.top < headBottom || box.bottom > window.innerHeight) window.scrollBy({ top: box.top - headBottom - 24, behavior: 'auto' })
      return
    }

    // Two columns: bring the debugger to the top of the screen, then scroll inside each column.
    const headBox = head.getBoundingClientRect()
    if (headBox.top > 1 || grid.getBoundingClientRect().top < headBox.bottom - 1) window.scrollBy({ top: bench.getBoundingClientRect().top })
    const columns = grid.querySelectorAll<HTMLElement>(':scope > .sim-col')
    if (line) {
      const col = line.closest<HTMLElement>('.sim-col')
      if (col) revealInColumn(col, line, col.querySelector('.sim-vars')?.getBoundingClientRect().height ?? 0, behavior)
    }
    if (changed) {
      const col = changed.closest<HTMLElement>('.sim-col')
      if (col && col === columns[columns.length - 1]) revealInColumn(col, changed, 0, behavior)
    }
  }, [cur, run])

  return benchRef
}
