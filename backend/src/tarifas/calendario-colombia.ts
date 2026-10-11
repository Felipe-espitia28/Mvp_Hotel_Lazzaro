// Calendario de Colombia: Pascua y días festivos (Ley 51 de 1983, "Ley Emiliani").
// Dominio puro: sin NestJS ni base de datos. Las fechas son días de calendario
// representados como Date a medianoche UTC (igual que las fechas de reserva).

export interface Festivo {
  fecha: Date;
  nombre: string;
}

const MS_DIA = 24 * 60 * 60 * 1000;

const dia = (anio: number, mes: number, numero: number) =>
  new Date(Date.UTC(anio, mes - 1, numero));
const masDias = (fecha: Date, dias: number) => new Date(fecha.getTime() + dias * MS_DIA);

// Domingo de Pascua (algoritmo anónimo gregoriano / Meeus-Jones-Butcher).
export function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const numero = ((h + l - 7 * m + 114) % 31) + 1;
  return dia(anio, mes, numero);
}

// Ley Emiliani: el festivo se traslada al lunes siguiente si no cae en lunes.
function alLunesSiguiente(fecha: Date): Date {
  const diaSemana = fecha.getUTCDay(); // 0 = domingo, 1 = lunes
  return masDias(fecha, (8 - diaSemana) % 7);
}

export function festivosDeColombia(anio: number): Festivo[] {
  const pascua = domingoDePascua(anio);
  const festivos: Festivo[] = [
    // Fijos: se celebran el mismo día.
    { fecha: dia(anio, 1, 1), nombre: 'Año Nuevo' },
    { fecha: dia(anio, 5, 1), nombre: 'Día del Trabajo' },
    { fecha: dia(anio, 7, 20), nombre: 'Día de la Independencia' },
    { fecha: dia(anio, 8, 7), nombre: 'Batalla de Boyacá' },
    { fecha: dia(anio, 12, 8), nombre: 'Inmaculada Concepción' },
    { fecha: dia(anio, 12, 25), nombre: 'Navidad' },
    // Trasladables al lunes.
    { fecha: alLunesSiguiente(dia(anio, 1, 6)), nombre: 'Reyes Magos' },
    { fecha: alLunesSiguiente(dia(anio, 3, 19)), nombre: 'San José' },
    { fecha: alLunesSiguiente(dia(anio, 6, 29)), nombre: 'San Pedro y San Pablo' },
    { fecha: alLunesSiguiente(dia(anio, 8, 15)), nombre: 'Asunción de la Virgen' },
    { fecha: alLunesSiguiente(dia(anio, 10, 12)), nombre: 'Día de la Raza' },
    { fecha: alLunesSiguiente(dia(anio, 11, 1)), nombre: 'Todos los Santos' },
    { fecha: alLunesSiguiente(dia(anio, 11, 11)), nombre: 'Independencia de Cartagena' },
    // Dependientes de la Pascua.
    { fecha: masDias(pascua, -3), nombre: 'Jueves Santo' },
    { fecha: masDias(pascua, -2), nombre: 'Viernes Santo' },
    { fecha: masDias(pascua, 43), nombre: 'Ascensión del Señor' },
    { fecha: masDias(pascua, 64), nombre: 'Corpus Christi' },
    { fecha: masDias(pascua, 71), nombre: 'Sagrado Corazón' },
  ];
  return festivos.sort((x, y) => x.fecha.getTime() - y.fecha.getTime());
}
