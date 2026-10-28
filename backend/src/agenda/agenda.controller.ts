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
  ActualizarRecursoDto,
  AgendarCitaDto,
  CambiarEstadoCitaDto,
  CambiarEstadoSalidaDto,
  ConsultarAgendaDto,
  ConsultarDisponibilidadDto,
  CrearRecursoDto,
  CrearSalidaDto,
  ListarSalidasDto,
  TomarCupoDto,
} from './agenda.dto';
import { AgendaService } from './agenda.service';

// S-2: la agenda del día, los huecos libres y los recursos (cabinas, terapeutas).
@ApiTags('Agenda')
@Controller('agenda')
@RequierePermiso(PERMISOS.AGENDA_GESTIONAR)
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  delDia(@HotelActual() hotel: ContextoHotel, @Query() query: ConsultarAgendaDto) {
    return this.agenda.agenda(hotel.id, query.fecha, query.recursoId);
  }

  @Get('disponibilidad')
  disponibilidad(@HotelActual() hotel: ContextoHotel, @Query() query: ConsultarDisponibilidadDto) {
    return this.agenda.disponibilidad(hotel, query.servicioId, query.fecha);
  }

  @Get('reservas/:reservaId')
  deReserva(@HotelActual() hotel: ContextoHotel, @Param('reservaId') reservaId: string) {
    return this.agenda.deReserva(hotel.id, reservaId);
  }

  @Get('recursos')
  recursos(@HotelActual() hotel: ContextoHotel) {
    return this.agenda.listarRecursos(hotel.id);
  }

  @Post('recursos')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  crearRecurso(@HotelActual() hotel: ContextoHotel, @Body() dto: CrearRecursoDto) {
    return this.agenda.crearRecurso(hotel.id, dto);
  }

  @Patch('recursos/:id')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  actualizarRecurso(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: ActualizarRecursoDto,
  ) {
    return this.agenda.actualizarRecurso(hotel.id, id, dto);
  }
}

@ApiTags('Agenda')
@Controller('citas')
@RequierePermiso(PERMISOS.AGENDA_GESTIONAR)
export class CitasController {
  constructor(private readonly agenda: AgendaService) {}

  @Post()
  agendar(
    @HotelActual() hotel: ContextoHotel,
    @Body() dto: AgendarCitaDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.agenda.agendar(hotel, dto, quien);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: CambiarEstadoCitaDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.agenda.cambiarEstadoCita(hotel, id, dto, quien);
  }
}

// S-2: las salidas de las experiencias y sus cupos. Nada se borra: se cancela.
@ApiTags('Agenda')
@Controller()
@RequierePermiso(PERMISOS.AGENDA_GESTIONAR)
export class SalidasController {
  constructor(private readonly agenda: AgendaService) {}

  @Get('salidas')
  listar(@HotelActual() hotel: ContextoHotel, @Query() query: ListarSalidasDto) {
    return this.agenda.listarSalidas(hotel.id, query.desde, query.hasta);
  }

  @Post('salidas')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  crear(@HotelActual() hotel: ContextoHotel, @Body() dto: CrearSalidaDto) {
    return this.agenda.crearSalidas(hotel.id, dto);
  }

  @Patch('salidas/:id/estado')
  cambiarEstado(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: CambiarEstadoSalidaDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.agenda.cambiarEstadoSalida(hotel, id, dto, quien);
  }

  @Post('salidas/:id/cupos')
  tomarCupo(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: TomarCupoDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.agenda.tomarCupo(hotel, id, dto, quien);
  }

  @Post('cupos/:id/cancelar')
  @HttpCode(200)
  cancelarCupo(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.agenda.cancelarCupo(hotel, id, quien);
  }
}
