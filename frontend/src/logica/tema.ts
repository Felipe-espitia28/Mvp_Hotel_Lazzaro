// Tema de la app a partir de la marca de un hotel: con dos colores (principal
// y acento) se generan las escalas que usa todo el CSS (--marca-*, --dorado-*).
// Los nombres de las variables no cambian: el CSS existente se adapta solo.
// Se corrigen los tonos que no darían contraste suficiente (WCAG AA 4,5:1).

export interface MarcaVisual {
  colorPrimario: string;
  colorAcento: string;
  fuenteTitulos: string;
  fuenteTexto: string;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

const BLANCO = '#ffffff';
const TEXTO_OSCURO = '#1f2328';
const FONDO = '#eaf4fb'; // fondo celeste muy claro de la app (--fondo)
const MINIMO_AA = 4.5;

function hexARgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbAHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

export function hexAHsl(hex: string): Hsl {
  const [r, g, b] = hexARgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / d + 2) * 60
        : ((r - g) / d + 4) * 60;
  return { h, s: s * 100, l: l * 100 };
}

export function hslAHex({ h, s, l }: Hsl) {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lum = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lum - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return rgbAHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

// Luminancia relativa y contraste según WCAG 2.1.
function luminancia(hex: string) {
  const [r, g, b] = hexARgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

const conLuz = (hsl: Hsl, l: number) => hslAHex({ ...hsl, l });

// Oscurece un color hasta que un texto (o fondo) dado contraste con él.
function oscurecerHasta(hex: string, contra: string, minimo = MINIMO_AA) {
  const hsl = hexAHsl(hex);
  let l = hsl.l;
  while (l > 5 && contraste(conLuz(hsl, l), contra) < minimo) l -= 2;
  return conLuz(hsl, l);
}

export interface Tema {
  variables: Record<string, string>;
  // Ajustes hechos para que la app se lea bien (para avisarle al hotel).
  avisos: string[];
}

// Tipos de letra con serifa: si faltan, el respaldo también es serif. Todo lo
// demás (Arial, Inter, Montserrat...) cae a una sans del sistema.
const CON_SERIFA = ['Playfair Display', 'Lora'];
const respaldoDe = (fuente: string) =>
  CON_SERIFA.includes(fuente)
    ? "Georgia, 'Times New Roman', serif"
    : "'Helvetica Neue', Helvetica, system-ui, sans-serif";

export function generarTema(marca: MarcaVisual): Tema {
  const avisos: string[] = [];

  // Principal: barra lateral, botones y títulos. El texto blanco sobre él
  // debe leerse; si el color es muy claro, se usa una versión más oscura.
  const principal = oscurecerHasta(marca.colorPrimario, BLANCO);
  if (principal !== marca.colorPrimario.toLowerCase()) {
    avisos.push(
      'El color principal es muy claro para el texto blanco del menú: se usa una versión más oscura.',
    );
  }
  const p = hexAHsl(principal);

  // Acento: botones destacados, el día de hoy, iconos. Su tono oscuro (600)
  // también sirve como texto sobre el fondo claro, así que debe contrastar.
  const a = hexAHsl(marca.colorAcento);
  const textoAcento =
    contraste(marca.colorAcento, TEXTO_OSCURO) >= MINIMO_AA ? TEXTO_OSCURO : BLANCO;
  if (contraste(marca.colorAcento, textoAcento) < MINIMO_AA) {
    avisos.push('El color de acento contrasta poco con el texto de los botones.');
  }
  const acento600 = oscurecerHasta(conLuz(a, Math.min(a.l, a.l - 8)), FONDO);

  return {
    avisos,
    variables: {
      '--marca-950': conLuz(p, Math.max(p.l - 6, 3)),
      '--marca-900': principal,
      '--marca-800': conLuz(p, Math.min(p.l + 5, 40)),
      '--marca-700': oscurecerHasta(conLuz(p, Math.min(p.l + 12, 45)), BLANCO),
      '--marca-500': conLuz({ ...p, s: p.s * 0.7 }, 50),
      '--marca-100': conLuz({ ...p, s: Math.min(p.s, 45) }, 93),
      '--dorado-600': acento600,
      '--dorado-500': marca.colorAcento,
      '--dorado-300': conLuz(a, Math.min(a.l + 18, 85)),
      '--dorado-100': conLuz({ ...a, s: Math.min(a.s, 70) }, 93),
      '--texto-acento': textoAcento,
      '--fuente-titulos': `'${marca.fuenteTitulos}', ${respaldoDe(marca.fuenteTitulos)}`,
      '--fuente': `'${marca.fuenteTexto}', ${respaldoDe(marca.fuenteTexto)}`,
    },
  };
}

// Aplica (o, con null, quita) la marca de un hotel en toda la app.
export function aplicarTema(marca: MarcaVisual | null) {
  const raiz = document.documentElement;
  const nombres = Object.keys(generarTema(marcaBase).variables);
  if (!marca) {
    nombres.forEach((n) => raiz.style.removeProperty(n));
    return;
  }
  for (const [nombre, valor] of Object.entries(generarTema(marca).variables)) {
    raiz.style.setProperty(nombre, valor);
  }
}

const marcaBase: MarcaVisual = {
  colorPrimario: '#12305c',
  colorAcento: '#2563eb',
  fuenteTitulos: 'Arial',
  fuenteTexto: 'Arial',
};
