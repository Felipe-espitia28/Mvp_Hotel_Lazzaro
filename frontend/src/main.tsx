import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fuentes empaquetadas con la app (funcionan sin internet el día de la demo).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
// Tipografías que cada hotel puede elegir para su marca.
import '@fontsource/lora/600.css';
import '@fontsource/lora/700.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/nunito-sans/400.css';
import '@fontsource/nunito-sans/600.css';
import '@fontsource/nunito-sans/700.css';
import App from './App';
import { PagoResultado } from './pages/PagoResultado';
import { PagoSimulado } from './pages/PagoSimulado';
import { paginaPublica } from './logica/pagosEnLinea';
import './index.css';

// B-2: las páginas del huésped (pago simulado y retorno del pago) no piden sesión.
const publica = paginaPublica(window.location.pathname, window.location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publica?.pagina === 'pago-simulado' ? (
      <PagoSimulado referencia={publica.referencia} />
    ) : publica?.pagina === 'pago-resultado' ? (
      <PagoResultado referencia={publica.referencia} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
