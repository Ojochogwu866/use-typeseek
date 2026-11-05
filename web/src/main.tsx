import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AccountProvider } from './components/account/AccountProvider';
import { ToastProvider } from './components/Toast';
import Home from './Home.tsx';
import './index.css';
import About from './pages/About.tsx';
import NotFound from './pages/NotFound.tsx';
import Privacy from './pages/Privacy.tsx';
import Saved from './pages/Saved.tsx';
import Search from './Search.tsx';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<ToastProvider>
					<AccountProvider>
				<Routes>
					<Route path="/" element={<Home />} />
					<Route path="/search" element={<Search />} />
					<Route path="/about" element={<About />} />
					<Route path="/privacy" element={<Privacy />} />
					<Route path="/saved" element={<Saved />} />
					<Route path="*" element={<NotFound />} />
				</Routes>
					</AccountProvider>
				</ToastProvider>
			</BrowserRouter>
		</QueryClientProvider>
	</StrictMode>
);
