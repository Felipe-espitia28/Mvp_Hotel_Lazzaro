import { execSync } from 'child_process';
import './entorno';

// globalSetup de Jest: aplica las migraciones (incluida la restricción
// reserva_sin_sobreventa) a la base de pruebas una sola vez antes de la suite.
export default function prepararBaseDePruebas() {
  execSync('npx prisma migrate deploy', {
    env: process.env,
    stdio: 'inherit',
  });
}
