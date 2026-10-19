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
import { ActualizarUsuarioDto, CrearUsuarioDto, RestablecerContrasenaDto } from './usuarios.dto';
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

  @Post()
  crear(@HotelActual() hotel: ContextoHotel, @Body() dto: CrearUsuarioDto) {
    return this.usuariosService.crear(hotel.id, dto);
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

  @Post(':id/restablecer-contrasena')
  @HttpCode(204)
  async restablecerContrasena(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: RestablecerContrasenaDto,
  ) {
    await this.usuariosService.restablecerContrasena(hotel.id, id, dto.nueva);
  }
}
