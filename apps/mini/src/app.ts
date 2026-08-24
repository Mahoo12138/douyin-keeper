import { PropsWithChildren } from 'react'

// Shared app entry for the Taro mobile console. Authentication and page data
// flows are kept in feature modules; defineAppConfig comes from Taro ambient types.
import './app.css'

function App({ children }: PropsWithChildren) {
  return children
}

export default App
