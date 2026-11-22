import { PrismaService } from '../src/prisma/prisma.service';
import { conBloqueoDeTarea } from '../src/prisma/bloqueo-de-tarea';

// D-04: dos instancias del backend no deben ejecutar la misma tarea a la vez.
describe('Bloqueo de tareas programadas (D-04)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Simula a otra instancia que ya tiene el bloqueo y lo mantiene hasta liberar().
  async function otraInstanciaConElBloqueo(tarea: string) {
    let liberar!: () => void;
    const hastaLiberar = new Promise<void>((resolver) => (liberar = resolver));
    let tomado!: () => void;
    const yaTomado = new Promise<void>((resolver) => (tomado = resolver));
    const transaccion = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${tarea}))`;
      tomado();
      await hastaLiberar;
    });
    await yaTomado;
    return { liberar, terminada: transaccion };
  }

  it('ejecuta el trabajo cuando nadie tiene el bloqueo', async () => {
    const trabajo = jest.fn().mockResolvedValue(undefined);
    expect(await conBloqueoDeTarea(prisma, 'prueba.libre', trabajo)).toBe(true);
    expect(trabajo).toHaveBeenCalledTimes(1);
  });

  it('omite la vuelta si otra instancia tiene el bloqueo, y corre cuando lo libera', async () => {
    const otra = await otraInstanciaConElBloqueo('prueba.ocupada');
    const trabajo = jest.fn().mockResolvedValue(undefined);

    expect(await conBloqueoDeTarea(prisma, 'prueba.ocupada', trabajo)).toBe(false);
    expect(trabajo).not.toHaveBeenCalled();

    otra.liberar();
    await otra.terminada;
    expect(await conBloqueoDeTarea(prisma, 'prueba.ocupada', trabajo)).toBe(true);
    expect(trabajo).toHaveBeenCalledTimes(1);
  });

  it('el bloqueo de una tarea no frena a las demás', async () => {
    const otra = await otraInstanciaConElBloqueo('prueba.una');
    const trabajo = jest.fn().mockResolvedValue(undefined);

    expect(await conBloqueoDeTarea(prisma, 'prueba.otra', trabajo)).toBe(true);
    expect(trabajo).toHaveBeenCalledTimes(1);

    otra.liberar();
    await otra.terminada;
  });

  it('libera el bloqueo aunque el trabajo falle', async () => {
    await expect(
      conBloqueoDeTarea(prisma, 'prueba.falla', () => Promise.reject(new Error('falló'))),
    ).rejects.toThrow('falló');

    const trabajo = jest.fn().mockResolvedValue(undefined);
    expect(await conBloqueoDeTarea(prisma, 'prueba.falla', trabajo)).toBe(true);
  });
});
