import { useState, type FormEvent } from 'react';
import { Building } from 'lucide-react';
import { api } from '../api/client';
import type { Empresa } from '../api/types';
import { CabeceraModal } from './CabeceraModal';

// B-5: crear o editar una empresa (solo el admin). El NIT se escribe como
// venga ("900.123.456-8"): el backend lo normaliza y revisa el dígito.
export function ModalEmpresa({
  empresa,
  onCerrar,
  onGuardada,
}: {
  empresa?: Empresa;
  onCerrar: () => void;
  onGuardada: (empresa: Empresa) => void;
}) {
  const [nit, setNit] = useState(empresa ? `${empresa.nit}-${empresa.digitoVerificacion}` : '');
  const [razonSocial, setRazonSocial] = useState(empresa?.razonSocial ?? '');
  const [email, setEmail] = useState(empresa?.email ?? '');
  const [telefono, setTelefono] = useState(empresa?.telefono ?? '');
  const [credito, setCredito] = useState(empresa?.credito ?? false);
  const [diasCredito, setDiasCredito] = useState(String(empresa?.diasCredito ?? 30));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    const datos = {
      nit,
      razonSocial,
      email,
      telefono: telefono.trim() || undefined,
      credito,
      diasCredito: credito ? Number(diasCredito) : undefined,
    };
    try {
      onGuardada(
        empresa
          ? await api.empresas.actualizar(empresa.id, datos)
          : await api.empresas.crear(datos),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la empresa');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <CabeceraModal icono={Building} titulo={empresa ? 'Editar empresa' : 'Nueva empresa'} />
        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="empresa-nit">NIT</label>
            <input
              id="empresa-nit"
              required
              placeholder="900.123.456-8"
              value={nit}
              onChange={(e) => setNit(e.target.value)}
            />
          </div>
          <div className="campo crece">
            <label htmlFor="empresa-razon">Razón social</label>
            <input
              id="empresa-razon"
              required
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
            />
          </div>
        </div>
        <div className="fila-campos">
          <div className="campo crece">
            <label htmlFor="empresa-email">Correo de facturación</label>
            <input
              id="empresa-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="empresa-telefono">Teléfono (opcional)</label>
            <input
              id="empresa-telefono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>
        </div>
        <label className="casilla">
          <input type="checkbox" checked={credito} onChange={(e) => setCredito(e.target.checked)} />
          Con crédito: su cuenta puede quedar pendiente al salir
        </label>
        {credito && (
          <div className="campo">
            <label htmlFor="empresa-dias">Días de crédito</label>
            <input
              id="empresa-dias"
              type="number"
              min={0}
              max={365}
              value={diasCredito}
              onChange={(e) => setDiasCredito(e.target.value)}
            />
          </div>
        )}
        {error && <div className="mensaje-error">{error}</div>}
        <div className="acciones-modal">
          <button type="button" className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="primario" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}
