import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ContextoHotel,
  HotelActual,
  RequierePermiso,
  UsuarioActual,
  UsuarioAutenticado,
} from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import {
  AbonoEmpresaDto,
  ActualizarEmpresaDto,
  AsignarEmpresaDto,
  BuscarEmpresasDto,
  CrearEmpresaDto,
} from './empresas.dto';
import { EmpresasService } from './empresas.service';

// B-5: empresas que pagan reservas. Crear y editar es de la gerencia;
// recepción las busca, las asigna y registra sus abonos.
@ApiTags('Empresas')
@Controller('empresas')
export class EmpresasController {
  constructor(private readonly empresas: EmpresasService) {}

  @Get()
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  buscar(@HotelActual() hotel: ContextoHotel, @Query() query: BuscarEmpresasDto) {
    return this.empresas.buscar(hotel.id, query.buscar);
  }

  @Post()
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  crear(@HotelActual() hotel: ContextoHotel, @Body() dto: CrearEmpresaDto) {
    return this.empresas.crear(hotel.id, dto);
  }

  @Patch(':id')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  actualizar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: ActualizarEmpresaDto,
  ) {
    return this.empresas.actualizar(hotel.id, id, dto);
  }

  @Get(':id/estado-de-cuenta')
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  estadoDeCuenta(@HotelActual() hotel: ContextoHotel, @Param('id') id: string) {
    return this.empresas.estadoDeCuenta(hotel.id, id);
  }

  // Un pago repartido entre varias reservas de la empresa (todo o nada).
  @Post(':id/abonos')
  @RequierePermiso(PERMISOS.FOLIO_GESTIONAR)
  abonar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: AbonoEmpresaDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.empresas.abonar(hotel, id, dto, quien);
  }
}

// B-5: quién paga una reserva.
@ApiTags('Empresas')
@Controller('reservas/:id/empresa')
export class EmpresaDeReservaController {
  constructor(private readonly empresas: EmpresasService) {}

  @Patch()
  @HttpCode(200)
  @RequierePermiso(PERMISOS.RESERVAS_GESTIONAR)
  asignar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: AsignarEmpresaDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.empresas.asignar(hotel, id, dto, quien);
  }
}
