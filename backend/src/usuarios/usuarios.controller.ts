import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { RequierePermiso, UsuarioActual, UsuarioAutenticado } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { ActualizarUsuarioDto, CrearUsuarioDto, RestablecerContrasenaDto } from './dto';
import { UsuariosService } from './usuarios.service';

// Gestión de las personas que usan el sistema: solo administradores.
@Controller('usuarios')
@RequierePermiso(PERMISOS.USUARIOS_GESTIONAR)
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  listar() {
    return this.usuariosService.listar();
  }

  @Post()
  crear(@Body() dto: CrearUsuarioDto) {
    return this.usuariosService.crear(dto);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarUsuarioDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.usuariosService.actualizar(id, dto, quien);
  }

  @Post(':id/restablecer-contrasena')
  @HttpCode(204)
  async restablecerContrasena(@Param('id') id: string, @Body() dto: RestablecerContrasenaDto) {
    await this.usuariosService.restablecerContrasena(id, dto.nueva);
  }
}
