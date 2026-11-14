import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/patrick-hand/vietnamese-400.css';
import './styles.css';
import './dark.css';
import { initTheme } from './theme';

initTheme();

// Safari iPhone chỉ bật trạng thái :active (nút lún xuống khi chạm) khi trang có nghe touchstart. Nghe rỗng, passive: không chặn cuộn.
document.addEventListener('touchstart', () => {}, { passive: true });

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
