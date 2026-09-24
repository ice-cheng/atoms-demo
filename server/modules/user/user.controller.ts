import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserService } from './user.service';
import { AuthService } from '../auth/auth.service';
import type { RechargeRequest, RechargeResponse, UpdateUserRequest, User, BrandKit } from '@shared/api.interface';

class UpdateUserDto implements UpdateUserRequest {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  newPassword?: string;
}

class DeleteAccountDto {
  @IsString()
  @MinLength(6)
  password!: string;
}

class RechargeDto implements RechargeRequest {
  @IsString()
  packageKey!: string;
}

class UpdateBrandKitDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  fontStyle?: 'modern' | 'serif' | 'handwriting' | 'monospace';
}

@Controller('api/user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  @Patch('profile')
  async updateProfile(
    @Headers('authorization') authorization: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    const userId = await this.authService.getUserIdFromHeader(authorization);

    let passwordHash: string | undefined;

    if (dto.newPassword !== undefined) {
      if (!dto.currentPassword) {
        throw new BadRequestException('修改密码需要提供当前密码');
      }
      const valid = await this.authService.verifyUserPassword(userId, dto.currentPassword);
      if (!valid) {
        throw new UnauthorizedException('当前密码不正确');
      }
      passwordHash = this.authService.hashPassword(dto.newPassword);
    }

    return this.userService.updateProfile(userId, {
      username: dto.username,
      passwordHash,
    });
  }

  @Post('recharge')
  async recharge(
    @Headers('authorization') authorization: string,
    @Body() dto: RechargeDto,
  ): Promise<RechargeResponse> {
    const userId = await this.authService.getUserIdFromHeader(authorization);
    return this.userService.recharge(userId, dto.packageKey);
  }

  @Delete('account')
  async deleteAccount(
    @Headers('authorization') authorization: string,
    @Body() dto: DeleteAccountDto,
  ): Promise<{ success: boolean }> {
    const userId = await this.authService.getUserIdFromHeader(authorization);

    const valid = await this.authService.verifyUserPassword(userId, dto.password);
    if (!valid) {
      throw new UnauthorizedException('密码不正确');
    }

    await this.userService.deleteAccount(userId);
    return { success: true };
  }

  @Get('brand-kit')
  async getBrandKit(
    @Headers('authorization') authorization: string,
  ): Promise<BrandKit> {
    const userId = await this.authService.getUserIdFromHeader(authorization);
    return this.userService.getBrandKit(userId);
  }

  @Patch('brand-kit')
  async updateBrandKit(
    @Headers('authorization') authorization: string,
    @Body() dto: UpdateBrandKitDto,
  ): Promise<BrandKit> {
    const userId = await this.authService.getUserIdFromHeader(authorization);
    return this.userService.updateBrandKit(userId, dto);
  }
}
