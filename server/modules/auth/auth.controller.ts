import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import type { AuthResponse, LoginRequest, RegisterRequest, User } from '@shared/api.interface';

class RegisterDto implements RegisterRequest {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsNotEmpty()
  username!: string;

  @MinLength(6)
  @IsNotEmpty()
  password!: string;
}

class LoginDto implements LoginRequest {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @MinLength(6)
  @IsNotEmpty()
  password!: string;
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto.email, dto.username, dto.password);
  }

  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  async me(@Headers('authorization') authorization: string): Promise<User> {
    return this.authService.getCurrentUser(authorization);
  }
}
