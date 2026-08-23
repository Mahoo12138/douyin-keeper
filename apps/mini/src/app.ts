import { PropsWithChildren } from 'react'

// Skeleton app entry. Real flows (wx.login + link-code binding) land in M4 per
// docs/13 §5. defineAppConfig comes from the Taro ambient types.
import './app.css'

function App({ children }: PropsWithChildren) {
  return children
}

export default App