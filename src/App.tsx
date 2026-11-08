import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import Home from './pages/Home'
import IdempotencyPattern from './pages/IdempotencyPattern'
import MerchantAuthPattern from './pages/MerchantAuthPattern'
import OAuthPattern from './pages/OAuthPattern'
import OutboxPattern from './pages/OutboxPattern'
import PayLaterPattern from './pages/PayLaterPattern'
import SessionsPattern from './pages/SessionsPattern'
import ShardingPattern from './pages/ShardingPattern'
import StepUpPattern from './pages/StepUpPattern'
import TwoPhasePattern from './pages/TwoPhasePattern'

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/patterns/finance/outbox" element={<OutboxPattern />} />
        <Route path="/patterns/finance/idempotency-keys" element={<IdempotencyPattern />} />
        <Route path="/patterns/finance/sharding" element={<ShardingPattern />} />
        <Route path="/patterns/finance/two-phase-commit" element={<TwoPhasePattern />} />
        <Route path="/patterns/security/sessions-vs-jwts" element={<SessionsPattern />} />
        <Route path="/patterns/security/oauth-pkce" element={<OAuthPattern />} />
        <Route path="/patterns/security/step-up-authentication" element={<StepUpPattern />} />
        <Route path="/patterns/case-studies/pay-later-checkout" element={<PayLaterPattern />} />
        <Route path="/patterns/case-studies/merchant-integration-auth" element={<MerchantAuthPattern />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default App
