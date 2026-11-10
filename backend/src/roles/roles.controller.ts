import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ContextoHotel,
  HotelActual,
  RequierePermiso,
  UsuarioActual,
  UsuarioAutenticado,
} from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { ActualizarRolDto, CrearRolDto, EliminarRolDto, VistaPreviaRolDto } from './roles.dto';
import { RolesService } from './roles.service';

// Plan 19: los roles del hotel (Gerencia → Equipo → Roles).
@ApiTags('Roles')
@Controller('roles')
@RequierePermiso(PERMISOS.ROLES_GESTIONAR)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  // También lo necesita quien solo gestiona personas (para ajustar permisos).
  @Get('catalogo')
  @RequierePermiso(PERMISOS.USUARIOS_GESTIONAR)
  catalogo() {
    return this.roles.catalogo();
  }

  // Quien gestiona personas necesita la lista para asignar un rol.
  @Get()
  @RequierePermiso(PERMISOS.USUARIOS_GESTIONAR)
  listar(@HotelActual() hotel: ContextoHotel) {
    return this.roles.listar(hotel.id);
  }

  @Get(':id')
  detalle(@HotelActual() hotel: ContextoHotel, @Param('id') id: string) {
    return this.roles.detalle(hotel.id, id);
  }

  @Post()
  crear(
    @HotelActual() hotel: ContextoHotel,
    @Body() dto: CrearRolDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.roles.crear(hotel.id, dto, quien);
  }

  @Patch(':id')
  actualizar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: ActualizarRolDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.roles.actualizar(hotel.id, id, dto, quien);
  }

  @Post(':id/vista-previa')
  @HttpCode(200)
  vistaPrevia(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: VistaPreviaRolDto,
  ) {
    return this.roles.vistaPrevia(hotel.id, id, dto.permisos);
  }

  @Delete(':id')
  @HttpCode(204)
  async eliminar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: EliminarRolDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    await this.roles.eliminar(hotel.id, id, dto.reasignarA, quien);
  }
}
