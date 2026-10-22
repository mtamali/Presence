import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { seedNativeDataIfEmpty } from './native/seed'
import './styles/index.css'

seedNativeDataIfEmpty()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary><App /></ErrorBoundary>,
)
