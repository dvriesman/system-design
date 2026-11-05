import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import Home from './pages/Home'
import IdempotencyPattern from './pages/IdempotencyPattern'
import OutboxPattern from './pages/OutboxPattern'
import ShardingPattern from './pages/ShardingPattern'
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default App
