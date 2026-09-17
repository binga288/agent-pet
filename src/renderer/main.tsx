import { createRoot } from 'react-dom/client';
import { Pet } from './pet';
import { Panel } from './panel';
import { useSnapshot } from './use-snapshot';
import './style.css';

const isPet = new URLSearchParams(location.search).get('view') === 'pet';
document.title = isPet ? 'Agent Pet' : 'Agent Pet · 任務中心';

function App() {
  const state = useSnapshot();
  if (!state) return null;
  return isPet ? <Pet state={state} /> : <Panel state={state} />;
}

createRoot(document.getElementById('root')!).render(<App />);
