import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequierePermiso, UsuarioActual, UsuarioAutenticado } from '../auth/decoradores';
import { CATALOGO_PERMISOS, GRUPOS_PERMISOS, PERMISOS } from '../auth/permisos';
import { ActualizarUsuarioDto, CrearUsuarioDto } from '../usuarios/usuarios.dto';
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
  crear(@Body() dto: CrearHotelDto, @UsuarioActual() quien: UsuarioAutenticado) {
    return this.plataformaService.crear(dto, quien.id);
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
  async crearUsuario(
    @Param('id') id: string,
    @Body() dto: CrearUsuarioDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    await this.plataformaService.detalle(id);
    return this.usuariosService.crear(id, dto, quien);
  }

  // Plan 19: los roles del hotel, para elegir el de cada persona. La Consola
  // no los edita: eso es de la Gerencia del hotel.
  @Get(':id/roles')
  async roles(@Param('id') id: string) {
    await this.plataformaService.detalle(id);
    return this.usuariosService.roles(id);
  }

  // El catálogo de permisos, para ajustar los de una persona desde la Consola.
  @Get(':id/catalogo-permisos')
  catalogoPermisos() {
    return { grupos: GRUPOS_PERMISOS, permisos: CATALOGO_PERMISOS, plantillas: [] };
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

  @Post(':id/usuarios/:usuarioId/reenviar-credenciales')
  @HttpCode(200)
  reenviarCredenciales(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.usuariosService.reenviarCredenciales(id, usuarioId, quien.id);
  }
}
