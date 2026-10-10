import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService, perfilDe } from './auth.service';
import { Publico, UsuarioActual, UsuarioAutenticado } from './decoradores';
import { CambiarContrasenaDto, LoginDto } from './auth.dto';

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
