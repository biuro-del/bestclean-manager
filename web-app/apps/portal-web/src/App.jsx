import { useEffect } from 'react'
import './index.css'
import './ui/styles/clientProfile.css'
import { mountPortalApp } from './ui/portalApp'

function App() {
  useEffect(() => {
    const cleanup = mountPortalApp()
    return () => cleanup()
  }, [])

  return <div id="portalAppRoot" />
}

export default App
