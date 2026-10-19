import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequierePermiso, UsuarioActual, UsuarioAutenticado } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import {
  ActualizarUsuarioDto,
  CrearUsuarioDto,
  RestablecerContrasenaDto,
} from '../usuarios/usuarios.dto';
import { UsuariosService } from '../usuarios/usuarios.service';
import { ActualizarHotelDto, CrearHotelDto } from './plataforma.dto';
import { PlataformaService } from './plataforma.service';

// Consola Lazaro: solo el equipo de Lazaro (rol plataforma).
@ApiTags('Consola Lazaro')
@Controller('plataforma/hoteles')
@RequierePermiso(PERMISOS.PLATAFORMA_GESTIONAR)
export class PlataformaController {
  constructor(
    private readonly plataformaService: PlataformaService,
    private readonly usuariosService: UsuariosService,
  ) {}

  @Get()
  listar() {
    return this.plataformaService.listar();
  }

  @Post()
  crear(@Body() dto: CrearHotelDto) {
    return this.plataformaService.crear(dto);
  }

  @Get(':id')
  detalle(@Param('id') id: string) {
    return this.plataformaService.detalle(id);
  }

  // Suspender / reactivar (p. ej. por falta de pago) o corregir sus datos.
  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() dto: ActualizarHotelDto) {
    return this.plataformaService.actualizar(id, dto);
  }

  // Acceso de las personas del hotel: Lazaro lo deja listo al venderlo.
  @Get(':id/usuarios')
  async listarUsuarios(@Param('id') id: string) {
    await this.plataformaService.detalle(id);
    return this.usuariosService.listar(id);
  }

  @Post(':id/usuarios')
  async crearUsuario(@Param('id') id: string, @Body() dto: CrearUsuarioDto) {
    await this.plataformaService.detalle(id);
    return this.usuariosService.crear(id, dto);
  }

  @Patch(':id/usuarios/:usuarioId')
  actualizarUsuario(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Body() dto: ActualizarUsuarioDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.usuariosService.actualizar(id, usuarioId, dto, quien);
  }

  @Post(':id/usuarios/:usuarioId/restablecer-contrasena')
  @HttpCode(204)
  async restablecerContrasena(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Body() dto: RestablecerContrasenaDto,
  ) {
    await this.usuariosService.restablecerContrasena(id, usuarioId, dto.nueva);
  }
}
