import type { ReactNode } from 'react';
import { Copy, ShieldAlert } from 'lucide-react';
import { api } from '../api/client';
import type { Parentesco, TipoDocumento } from '../api/types';
import { ETIQUETA_PARENTESCO, ETIQUETA_TIPO_DOCUMENTO, PAISES } from '../formato';
import {
  PARENTESCOS_CON_PERMISO,
  edadEn,
  esMenor,
  faltantes,
  igualQueTitular,
  ocupanteDesdeHuesped,
  type FormularioOcupante,
} from '../logica/ocupantes';

interface Props {
  indice: number;
  ocupante: FormularioOcupante;
  onCambiar: (ocupante: FormularioOcupante) => void;
  // El titular (para "igual que el titular") y los adultos que pueden responder por un menor.
  titular: FormularioOcupante;
  adultos: { indice: number; nombre: string }[];
  fechaEntrada: string;
  // Mensaje del backend por campo (R43–R45).
  problemas: Record<string, string>;
  versionPolitica: number | null;
  // Nombre con que está registrado el titular, si hay que separarlo (R46).
  nombreRegistrado?: string;
  // A-6: id del <datalist> con los municipios de Colombia.
  listaMunicipios: string;
}

const nombreDe = (o: FormularioOcupante) =>
  [o.primerNombre, o.segundoNombre, o.primerApellido, o.segundoApellido]
    .filter((p) => p.trim())
    .join(' ');

// Un campo del formulario con el mensaje del backend debajo, si lo tiene. Sin
// etiqueta cuando el control trae la suya (casillas).
function Campo(props: { id: string; etiqueta?: string; error?: string; children: ReactNode }) {
  return (
    <div className={`campo ${props.error ? 'con-error' : ''}`}>
      {props.etiqueta && <label htmlFor={props.id}>{props.etiqueta}</label>}
      {props.children}
      {props.error && (
        <span className="error-campo" id={`${props.id}-error`}>
          {props.error}
        </span>
      )}
    </div>
  );
}

// R43–R45: la tarjeta de un ocupante en el check-in. La primera es el titular.
export function TarjetaOcupante({
  indice,
  ocupante: o,
  onCambiar,
  titular,
  adultos,
  fechaEntrada,
  problemas,
  versionPolitica,
  nombreRegistrado,
  listaMunicipios,
}: Props) {
  const esTitular = indice === 0;
  const menor = esMenor(o, fechaEntrada);
  const pendientes = faltantes(o).length;
  const id = (campo: string) => `ocupante-${indice}-${campo}`;
  const cambiar = (cambios: Partial<FormularioOcupante>) => onCambiar({ ...o, ...cambios });

  // Atributos comunes de un control: su id y, si el backend lo marcó, el error.
  const control = (campo: string) => ({
    id: id(campo),
    'aria-invalid': problemas[campo] ? true : undefined,
    'aria-describedby': problemas[campo] ? `${id(campo)}-error` : undefined,
  });

  // Un documento ya registrado completa los datos del huésped (R35, R36).
  async function reconocer() {
    if (esTitular || !o.documento.trim()) return;
    try {
      const huesped = await api.huespedPorDocumento(o.tipoDocumento, o.documento.trim());
      onCambiar(huesped ? ocupanteDesdeHuesped(huesped, o) : { ...o, nombresBloqueados: false });
    } catch {
      // Sin conexión con el backend: se escriben los datos a mano.
    }
  }

  const selectorPais = (campo: 'nacionalidad' | 'paisResidencia' | 'paisProcedencia') => (
    <select
      {...control(campo)}
      value={o[campo]}
      onChange={(e) => cambiar({ [campo]: e.target.value })}
    >
      <option value="">Elige un país</option>
      {Object.entries(PAISES).map(([codigo, nombre]) => (
        <option key={codigo} value={codigo}>
          {nombre}
        </option>
      ))}
    </select>
  );

  return (
    <fieldset className="tarjeta-ocupante">
      <legend>
        {esTitular ? 'Titular' : `Acompañante ${indice}`}
        {nombreDe(o) && <span className="texto-secundario"> · {nombreDe(o)}</span>}
        {menor && <span className="badge-estado confirmada">Menor de edad</span>}
        {pendientes > 0 && (
          <span className="badge-estado no_show">
            {pendientes === 1 ? 'Falta 1 dato' : `Faltan ${pendientes} datos`}
          </span>
        )}
      </legend>

      <div className="fila-campos">
        <Campo
          id={id('tipoDocumento')}
          etiqueta="Tipo de documento"
          error={problemas.tipoDocumento}
        >
          <select
            {...control('tipoDocumento')}
            value={o.tipoDocumento}
            disabled={esTitular}
            onChange={(e) => cambiar({ tipoDocumento: e.target.value as TipoDocumento })}
          >
            {Object.entries(ETIQUETA_TIPO_DOCUMENTO).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id={id('documento')} etiqueta="Número de documento" error={problemas.documento}>
          <input
            {...control('documento')}
            value={o.documento}
            disabled={esTitular}
            onChange={(e) => cambiar({ documento: e.target.value })}
            onBlur={reconocer}
          />
        </Campo>
      </div>

      {nombreRegistrado && (
        <p className="texto-secundario">
          Registrado como <strong>{nombreRegistrado}</strong>: separa sus nombres y apellidos.
        </p>
      )}
      {o.nombresBloqueados && (
        <p className="texto-secundario">Huésped registrado: su nombre no se cambia aquí.</p>
      )}
      <div className="fila-campos">
        {(
          [
            ['primerNombre', 'Primer nombre'],
            ['segundoNombre', 'Segundo nombre'],
            ['primerApellido', 'Primer apellido'],
            ['segundoApellido', 'Segundo apellido'],
          ] as const
        ).map(([campo, etiqueta]) => (
          <Campo key={campo} id={id(campo)} etiqueta={etiqueta} error={problemas[campo]}>
            <input
              {...control(campo)}
              value={o[campo]}
              disabled={o.nombresBloqueados}
              onChange={(e) => cambiar({ [campo]: e.target.value })}
            />
          </Campo>
        ))}
      </div>

      <div className="fila-campos">
        <Campo
          id={id('fechaNacimiento')}
          etiqueta="Fecha de nacimiento"
          error={problemas.fechaNacimiento}
        >
          <input
            {...control('fechaNacimiento')}
            type="date"
            value={o.fechaNacimiento}
            onChange={(e) => cambiar({ fechaNacimiento: e.target.value })}
          />
        </Campo>
        <Campo id={id('nacionalidad')} etiqueta="Nacionalidad" error={problemas.nacionalidad}>
          {selectorPais('nacionalidad')}
        </Campo>
      </div>

      {!esTitular && (
        <button
          type="button"
          className="enlace"
          onClick={() => onCambiar(igualQueTitular(o, titular))}
        >
          <Copy size={14} /> Residencia y procedencia igual que el titular
        </button>
      )}
      <div className="fila-campos">
        <Campo
          id={id('paisResidencia')}
          etiqueta="País de residencia"
          error={problemas.paisResidencia}
        >
          {selectorPais('paisResidencia')}
        </Campo>
        <Campo
          id={id('ciudadResidencia')}
          etiqueta="Ciudad de residencia"
          error={problemas.ciudadResidencia}
        >
          <input
            {...control('ciudadResidencia')}
            list={o.paisResidencia === 'CO' ? listaMunicipios : undefined}
            value={o.ciudadResidencia}
            onChange={(e) => cambiar({ ciudadResidencia: e.target.value })}
          />
        </Campo>
      </div>
      <div className="fila-campos">
        <Campo
          id={id('paisProcedencia')}
          etiqueta="País de procedencia"
          error={problemas.paisProcedencia}
        >
          {selectorPais('paisProcedencia')}
        </Campo>
        <Campo
          id={id('ciudadProcedencia')}
          etiqueta="Ciudad de procedencia (de donde viene)"
          error={problemas.ciudadProcedencia}
        >
          <input
            {...control('ciudadProcedencia')}
            list={o.paisProcedencia === 'CO' ? listaMunicipios : undefined}
            value={o.ciudadProcedencia}
            onChange={(e) => cambiar({ ciudadProcedencia: e.target.value })}
          />
        </Campo>
      </div>

      {menor ? (
        <div className="bloque-menor">
          <p className="mensaje-aviso">
            <ShieldAlert size={16} /> Menor de {edadEn(o.fechaNacimiento, fechaEntrada)} años. Un
            menor no puede alojarse sin un adulto responsable (Ley 1336 de 2009).
          </p>
          <div className="fila-campos">
            <Campo
              id={id('responsableIndice')}
              etiqueta="Adulto responsable"
              error={problemas.responsableIndice}
            >
              <select
                {...control('responsableIndice')}
                value={o.responsableIndice ?? ''}
                onChange={(e) =>
                  cambiar({
                    responsableIndice: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">Elige un adulto</option>
                {adultos.map((a) => (
                  <option key={a.indice} value={a.indice}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo
              id={id('parentesco')}
              etiqueta="Parentesco con el adulto"
              error={problemas.parentesco}
            >
              <select
                {...control('parentesco')}
                value={o.parentesco}
                onChange={(e) => cambiar({ parentesco: e.target.value as Parentesco | '' })}
              >
                <option value="">Elige el parentesco</option>
                {Object.entries(ETIQUETA_PARENTESCO).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          {o.parentesco && PARENTESCOS_CON_PERMISO.includes(o.parentesco) && (
            <Campo id={id('autorizacionVerificada')} error={problemas.autorizacionVerificada}>
              <label className="casilla">
                <input
                  {...control('autorizacionVerificada')}
                  type="checkbox"
                  checked={o.autorizacionVerificada}
                  onChange={(e) => cambiar({ autorizacionVerificada: e.target.checked })}
                />
                Verifiqué la autorización de los padres
              </label>
            </Campo>
          )}
        </div>
      ) : (
        <Campo id={id('aceptaPoliticaDatos')} error={problemas.aceptaPoliticaDatos}>
          <label className="casilla">
            <input
              {...control('aceptaPoliticaDatos')}
              type="checkbox"
              checked={o.aceptaPoliticaDatos}
              onChange={(e) => cambiar({ aceptaPoliticaDatos: e.target.checked })}
            />
            Acepta la política de tratamiento de datos
            {versionPolitica !== null && ` (versión ${versionPolitica})`}
          </label>
        </Campo>
      )}
    </fieldset>
  );
}
