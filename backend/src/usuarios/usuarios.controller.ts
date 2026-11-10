import { ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ContextoHotel,
  HotelActual,
  RequierePermiso,
  UsuarioActual,
  UsuarioAutenticado,
} from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { ActualizarUsuarioDto, CrearUsuarioDto } from './usuarios.dto';
import { UsuariosService } from './usuarios.service';

// Equipo del hotel: su administrador gestiona a las personas de SU hotel.
@ApiTags('Usuarios')
@Controller('usuarios')
@RequierePermiso(PERMISOS.USUARIOS_GESTIONAR)
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  listar(@HotelActual() hotel: ContextoHotel) {
    return this.usuariosService.listar(hotel.id);
  }

  // R70: la contraseña la genera el sistema y llega al correo.
  @Post()
  crear(
    @HotelActual() hotel: ContextoHotel,
    @Body() dto: CrearUsuarioDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.usuariosService.crear(hotel.id, dto, quien);
  }

  @Patch(':id')
  actualizar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: ActualizarUsuarioDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.usuariosService.actualizar(hotel.id, id, dto, quien);
  }

  // Una temporal nueva por correo; cierra las sesiones abiertas (R74).
  @Post(':id/reenviar-credenciales')
  @HttpCode(200)
  reenviarCredenciales(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.usuariosService.reenviarCredenciales(hotel.id, id, quien.id);
  }
}
