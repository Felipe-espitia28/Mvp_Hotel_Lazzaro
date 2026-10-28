// B-2: las 4 llaves de la cuenta de Wompi de un hotel. El ambiente se deduce
// de los prefijos que publica Wompi ("Ambientes y llaves"): pub_test_ /
// pub_prod_, prv_…, test_events_ / prod_events_, test_integrity_ / prod_integrity_.

export interface LlavesWompi {
  llavePublica: string;
  llavePrivada: string;
  secretoEventos: string;
  secretoIntegridad: string;
}

export type Ambiente = 'pruebas' | 'produccion';

const PREFIJOS: Record<keyof LlavesWompi, { pruebas: string; produccion: string; nombre: string }> =
  {
    llavePublica: { pruebas: 'pub_test_', produccion: 'pub_prod_', nombre: 'La llave pública' },
    llavePrivada: { pruebas: 'prv_test_', produccion: 'prv_prod_', nombre: 'La llave privada' },
    secretoEventos: {
      pruebas: 'test_events_',
      produccion: 'prod_events_',
      nombre: 'El secreto de eventos',
    },
    secretoIntegridad: {
      pruebas: 'test_integrity_',
      produccion: 'prod_integrity_',
      nombre: 'El secreto de integridad',
    },
  };

export function ambienteDe(llavePublica: string): Ambiente | null {
  if (llavePublica.startsWith(PREFIJOS.llavePublica.pruebas)) return 'pruebas';
  if (llavePublica.startsWith(PREFIJOS.llavePublica.produccion)) return 'produccion';
  return null;
}

// Devuelve el problema (para un 400) o null si las llaves sirven. Mientras no
// haya un despliegue real solo se aceptan las de pruebas (sandbox).
export function problemaConLlaves(llaves: LlavesWompi): string | null {
  for (const campo of Object.keys(PREFIJOS) as (keyof LlavesWompi)[]) {
    const { pruebas, produccion, nombre } = PREFIJOS[campo];
    const valor = llaves[campo].trim();
    if (valor.startsWith(produccion)) {
      return `${nombre} es de producción: por ahora solo se aceptan las llaves de pruebas (sandbox)`;
    }
    if (!valor.startsWith(pruebas) || valor.length <= pruebas.length) {
      return `${nombre} no tiene el formato de Wompi (debe empezar por ${pruebas})`;
    }
  }
  return null;
}
