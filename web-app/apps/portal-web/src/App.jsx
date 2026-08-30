import { useEffect } from 'react'
import '@phosphor-icons/web/regular'
import './index.css'
import './ui/styles/clientProfile.css'
import { mountPortalApp } from './ui/portalApp'
import '@phosphor-icons/web/regular'
import './ui/styles/portalQuality.css'
import './ui/styles/commandCenter.css'
import './ui/styles/login.css'
import './ui/styles/systemUiV3.css'

function App() {
  useEffect(() => {
    const cleanup = mountPortalApp()
    return () => cleanup()
  }, [])

  return <div id="portalAppRoot" />
}

export default App
