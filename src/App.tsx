import type { ComponentType } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { GuideFrame } from './components/GuideFrame'
import { GUIDES, findGuide, guidePath } from './data/catalog'
import AuthzModelsPattern from './pages/AuthzModelsPattern'
import CircuitBreakerPattern from './pages/CircuitBreakerPattern'
import GrantTypesPattern from './pages/GrantTypesPattern'
import Home from './pages/Home'
import IdempotencyPattern from './pages/IdempotencyPattern'
import MerchantAuthPattern from './pages/MerchantAuthPattern'
import MfaPattern from './pages/MfaPattern'
import OAuthPattern from './pages/OAuthPattern'
import OutboxPattern from './pages/OutboxPattern'
import PayLaterPattern from './pages/PayLaterPattern'
import SagaPattern from './pages/SagaPattern'
import SessionsPattern from './pages/SessionsPattern'
import ShardingPattern from './pages/ShardingPattern'
import StepUpPattern from './pages/StepUpPattern'
import TwoPhasePattern from './pages/TwoPhasePattern'

// Each guide in the catalog, and the page that renders it.
const PAGES: Record<string, ComponentType> = {
  'idempotency-keys': IdempotencyPattern,
  outbox: OutboxPattern,
  'two-phase-commit': TwoPhasePattern,
  saga: SagaPattern,
  sharding: ShardingPattern,
  'circuit-breaker': CircuitBreakerPattern,
  'sessions-vs-jwts': SessionsPattern,
  'oauth-pkce': OAuthPattern,
  'oauth-grant-types': GrantTypesPattern,
  'multi-factor-authentication': MfaPattern,
  'step-up-authentication': StepUpPattern,
  'rbac-abac-rebac': AuthzModelsPattern,
  'pay-later-checkout': PayLaterPattern,
  'merchant-integration-auth': MerchantAuthPattern,
}

// Links from before the catalog was reorganized, such as /patterns/finance/outbox, still work.
function LegacyRedirect() {
  const { slug = '' } = useParams()
  const guide = findGuide(slug)
  return <Navigate to={guide ? guidePath(guide) : '/'} replace />
}

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        {GUIDES.map((g) => {
          const Page = PAGES[g.slug]
          return (
            <Route
              key={g.slug}
              path={guidePath(g)}
              element={
                <GuideFrame guide={g}>
                  <Page />
                </GuideFrame>
              }
            />
          )
        })}
        <Route path="/patterns/:group/:slug" element={<LegacyRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default App
