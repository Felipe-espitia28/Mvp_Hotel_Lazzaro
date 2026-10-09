import { Injectable } from '@nestjs/common';

// Fuente de la hora actual. Las reglas de cancelación y no-show dependen de
// "ahora"; inyectarlo permite probarlas fijando la hora en las pruebas.
@Injectable()
export class Reloj {
  ahora(): Date {
    return new Date();
  }
}
