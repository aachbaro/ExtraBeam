import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../common/auth/guards/jwt.guard';
import { RolesGuard } from '../common/auth/guards/roles.guard';
import { User } from '../common/auth/decorators/user.decorator';
import type { AuthUser } from '../common/auth/auth.types';
import { StrictValidationPipe } from '../common/pipes/strict-validation.pipe';
import { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

@Controller('auth')
@UseGuards(RolesGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UsePipes(StrictValidationPipe)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  @UsePipes(StrictValidationPipe)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@User() user: AuthUser) {
    return this.authService.getMe(user);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1] ?? '';
    return this.authService.logout(token);
  }
}
