// Google Tag Manager. The container decides which tags run, such as GA4. It loads only on the production host, so local
// development, previews and tests send nothing. The container ID is public by design: every visitor's browser sees it.
const CONTAINER = 'GTM-K62PFBTB'
const PRODUCTION_HOSTS = ['system-design-nine-flax.vercel.app']

declare global {
  interface Window {
    dataLayer: unknown[]
  }
}

export function startAnalytics() {
  if (!PRODUCTION_HOSTS.includes(window.location.hostname)) return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtm.js?id=${CONTAINER}`
  document.head.appendChild(script)
}
