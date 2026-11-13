import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './styles.css';

// Safari iPhone chỉ bật trạng thái :active (nút lún xuống khi chạm) khi trang có nghe touchstart. Nghe rỗng, passive: không chặn cuộn.
document.addEventListener('touchstart', () => {}, { passive: true });

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
