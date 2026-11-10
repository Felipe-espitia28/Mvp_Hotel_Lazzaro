import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOGO_PERMISOS, PERMISOS, PERMISOS_PLATAFORMA, PLANTILLAS_DE_ROL } from './permisos';
import { permisosEfectivos, puedeOtorgar, validarPermisos } from './permisos-efectivos';

describe('Permisos efectivos (R75)', () => {
  it('solo los del rol', () => {
    expect(permisosEfectivos(['reservas:ver', 'habitaciones:ver'])).toEqual([
      'reservas:ver',
      'habitaciones:ver',
    ]);
  });

  it('con agregados y con quitados', () => {
    expect(permisosEfectivos(['reservas:ver'], ['caja:turno'])).toEqual([
      'reservas:ver',
      'caja:turno',
    ]);
    expect(permisosEfectivos(['reservas:ver', 'caja:turno'], [], ['caja:turno'])).toEqual([
      'reservas:ver',
    ]);
  });

  it('un permiso agregado y quitado a la vez queda quitado', () => {
    expect(permisosEfectivos(['reservas:ver'], ['caja:turno'], ['caja:turno'])).toEqual([
      'reservas:ver',
    ]);
  });
});

describe('Validar una lista de permisos', () => {
  it('rechaza una clave desconocida, un duplicado y un requisito sin cumplir', () => {
    expect(validarPermisos(['reservas:ver', 'inventado:x'])).toEqual([
      '"inventado:x" no es un permiso del hotel',
    ]);
    expect(validarPermisos(['reservas:ver', 'reservas:ver'])).toEqual([
      '"Ver reservas y huéspedes" está repetido',
    ]);
    expect(validarPermisos(['reservas:gestionar'])).toEqual([
      '"Crear, modificar y cancelar reservas" necesita "Ver reservas y huéspedes"',
    ]);
    // La Consola no es un permiso que un hotel pueda dar.
    expect(validarPermisos(['plataforma:gestionar'])).toHaveLength(1);
    expect(validarPermisos(['reservas:ver', 'reservas:gestionar'])).toEqual([]);
  });
});

describe('Anti-escalamiento (R76)', () => {
  it('devuelve exactamente los permisos que el actor no tiene', () => {
    expect(
      puedeOtorgar(['reservas:ver', 'usuarios:gestionar'], ['reservas:ver', 'pagos:anular']),
    ).toEqual(['pagos:anular']);
    expect(puedeOtorgar(['reservas:ver'], ['reservas:ver'])).toEqual([]);
  });
});

describe('Integridad del catálogo', () => {
  const claves = CATALOGO_PERMISOS.map((e) => e.clave as string);

  it('cada permiso usado por un controlador está en el catálogo (salvo el de la Consola)', () => {
    // Se leen los @RequierePermiso de verdad, no una lista copiada a mano.
    const usados = new Set<string>();
    const recorrer = (carpeta: string) => {
      for (const nombre of readdirSync(carpeta)) {
        const ruta = join(carpeta, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts')) {
          for (const [, clave] of readFileSync(ruta, 'utf8').matchAll(/PERMISOS\.([A-Z_]+)/g)) {
            usados.add(PERMISOS[clave as keyof typeof PERMISOS]);
          }
        }
      }
    };
    recorrer(join(__dirname, '..'));
    for (const permiso of usados) {
      if (PERMISOS_PLATAFORMA.includes(permiso as never)) continue;
      expect(claves).toContain(permiso);
    }
    // Y todo permiso definido, salvo el de la Consola, se puede dar.
    expect(new Set(claves)).toEqual(
      new Set(Object.values(PERMISOS).filter((p) => p !== 'plataforma:gestionar')),
    );
  });

  it('cada requisito existe y no hay ciclos', () => {
    const porClave = new Map(CATALOGO_PERMISOS.map((e) => [e.clave as string, e.requiere]));
    for (const e of CATALOGO_PERMISOS) {
      for (const r of e.requiere) expect(claves).toContain(r);
    }
    const visitar = (clave: string, camino: string[]): void => {
      expect(camino).not.toContain(clave);
      for (const r of porClave.get(clave) ?? []) visitar(r, [...camino, clave]);
    };
    for (const clave of claves) visitar(clave, []);
  });

  it('las plantillas cumplen sus propios requisitos', () => {
    for (const plantilla of Object.values(PLANTILLAS_DE_ROL)) {
      expect(validarPermisos(plantilla.permisos)).toEqual([]);
    }
  });

  it('las plantillas reproducen exactamente los permisos de los roles fijos anteriores', () => {
    // Foto de PERMISOS_POR_ROL antes del plan 19 (backend/src/auth/permisos.ts).
    const OPERACION_DIARIA = [
      'habitaciones:ver',
      'habitaciones:estado',
      'reservas:ver',
      'reservas:gestionar',
      'estadias:gestionar',
      'folio:gestionar',
      'no-shows:procesar',
      'reportes-legales:ver',
      'agenda:gestionar',
      'caja:turno',
      'limpieza:gestionar',
      'limpieza:asignar',
    ];
    const ANTES = {
      recepcionista: OPERACION_DIARIA,
      admin: [
        ...OPERACION_DIARIA,
        'habitaciones:gestionar',
        'usuarios:gestionar',
        'hotel:configurar',
        'pagos:anular',
        'cuentas:por-cobrar',
        'panel:gerencia',
        'caja:supervisar',
        'pagos:configurar',
      ],
      housekeeping: ['habitaciones:ver', 'limpieza:gestionar'],
      plataforma: ['plataforma:gestionar'],
    };
    const ordenar = (l: readonly string[]) => [...l].sort();
    expect(ordenar(PLANTILLAS_DE_ROL.Recepción.permisos)).toEqual(ordenar(ANTES.recepcionista));
    expect(ordenar(PLANTILLAS_DE_ROL.Administrador.permisos)).toEqual(
      ordenar([...ANTES.admin, 'roles:gestionar']),
    );
    expect(ordenar(PLANTILLAS_DE_ROL.Camarera.permisos)).toEqual(ordenar(ANTES.housekeeping));
    expect(ordenar(PERMISOS_PLATAFORMA)).toEqual(ordenar(ANTES.plataforma));
  });
});
