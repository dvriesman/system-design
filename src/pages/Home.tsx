import { Link } from 'react-router-dom'
import { patternGroups } from '../data/patterns'

export default function Home() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">System Design: Interactive Learning</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Pick a pattern from the sidebar. Each one is a hands-on, step-through simulation — see the mechanism, the
          state at every step, and where it breaks.
        </p>
      </div>

      {patternGroups.map((group) => (
        <section key={group.slug}>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{group.title}</h2>
          <div className="mt-2 flex flex-col gap-2">
            {group.patterns.map((pattern) => (
              <Link
                key={pattern.slug}
                to={`/patterns/${group.slug}/${pattern.slug}`}
                className="rounded-lg border border-gray-200 p-3 transition-colors hover:border-purple-300 hover:bg-purple-50 dark:border-gray-800 dark:hover:border-purple-800 dark:hover:bg-purple-950/30"
              >
                <div className="font-medium">{pattern.title}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{pattern.summary}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
