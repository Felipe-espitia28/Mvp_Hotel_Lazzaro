import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService, perfilDe } from './auth.service';
import { Publico, UsuarioActual, UsuarioAutenticado } from './decoradores';
import { CambiarContrasenaDto, LoginDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Publico()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.contrasena);
  }

  // Perfil y permisos de quien tiene la sesión abierta.
  @Get('yo')
  yo(@UsuarioActual() usuario: UsuarioAutenticado) {
    return perfilDe(usuario);
  }

  @Post('cambiar-contrasena')
  @HttpCode(204)
  async cambiarContrasena(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: CambiarContrasenaDto,
  ) {
    await this.authService.cambiarContrasena(usuario.id, dto.actual, dto.nueva);
  }
}
