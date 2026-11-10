import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService, perfilDe } from './auth.service';
import { PermitidoSinCambio, Publico, UsuarioActual, UsuarioAutenticado } from './decoradores';
import { CambiarContrasenaDto, LoginDto, RecuperarDto, RestablecerDto } from './auth.dto';

@ApiTags('Sesión')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Publico()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.contrasena);
  }

  // Perfil y permisos de quien tiene la sesión abierta.
  @Get('yo')
  @PermitidoSinCambio()
  yo(@UsuarioActual() usuario: UsuarioAutenticado) {
    return perfilDe(usuario);
  }

  // Devuelve un token nuevo: el anterior (y el de cualquier otra sesión) queda inválido.
  @Post('cambiar-contrasena')
  @PermitidoSinCambio()
  @HttpCode(200)
  cambiarContrasena(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: CambiarContrasenaDto,
  ) {
    return this.authService.cambiarContrasena(usuario.id, dto.actual, dto.nueva);
  }

  // R73: siempre 204, exista o no el correo.
  @Publico()
  @UseGuards(ThrottlerGuard)
  @Post('recuperar')
  @HttpCode(204)
  async recuperar(@Body() dto: RecuperarDto) {
    await this.authService.recuperar(dto.email);
  }

  @Publico()
  @UseGuards(ThrottlerGuard)
  @Post('restablecer')
  @HttpCode(204)
  async restablecer(@Body() dto: RestablecerDto) {
    await this.authService.restablecer(dto.token, dto.nueva);
  }
}
