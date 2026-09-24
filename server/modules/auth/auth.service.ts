import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from "@lark-apaas/fullstack-nestjs-core";
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import { atomsUsers } from '../../database/schema';
import type { User, BrandKit, FontStyle } from '@shared/api.interface';

@Injectable()
export class AuthService {
  private tokenStore = new Map<string, string>(); // token -> userId

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64) as Buffer;
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  private verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const derivedKey = crypto.scryptSync(password, salt, 64) as Buffer;
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derivedKey);
  }

  private generateToken(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    this.tokenStore.set(token, userId);
    return token;
  }

  private toUserResponse(row: typeof atomsUsers.$inferSelect): User {
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      credits: row.credits,
      brandKit: {
        enabled: row.brandEnabled ?? false,
        brandName: row.brandName ?? '',
        primaryColor: row.brandPrimaryColor ?? '#7c3aed',
        secondaryColor: row.brandSecondaryColor ?? '#06b6d4',
        fontStyle: (row.brandFontStyle as FontStyle) ?? 'modern',
      },
      createdAt: row.createdAt.toISOString(),
    };
  }

  async findByEmail(email: string): Promise<typeof atomsUsers.$inferSelect | null> {
    const rows = await this.db
      .select()
      .from(atomsUsers)
      .where(eq(atomsUsers.email, email.toLowerCase().trim()));
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<typeof atomsUsers.$inferSelect | null> {
    const rows = await this.db.select().from(atomsUsers).where(eq(atomsUsers.id, id));
    return rows[0] ?? null;
  }

  async register(
    email: string,
    username: string,
    password: string,
  ): Promise<{ user: User; token: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('邮箱已被注册');
    }

    const passwordHash = this.hashPassword(password);
    const [newUser] = await this.db
      .insert(atomsUsers)
      .values({ email: normalizedEmail, username: username.trim(), passwordHash })
      .returning();

    const token = this.generateToken(newUser.id);
    return { user: this.toUserResponse(newUser), token };
  }

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const user = await this.findByEmail(email);
    if (!user || !this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const token = this.generateToken(user.id);
    return { user: this.toUserResponse(user), token };
  }

  validateToken(token: string): string | null {
    return this.tokenStore.get(token) ?? null;
  }

  extractTokenFromHeader(authorizationHeader: string | undefined): string | null {
    if (!authorizationHeader) return null;
    const parts = authorizationHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
    return parts[1];
  }

  async getCurrentUser(authorizationHeader: string | undefined): Promise<User> {
    const token = this.extractTokenFromHeader(authorizationHeader);
    if (!token) {
      throw new UnauthorizedException('未提供认证令牌');
    }

    const userId = this.validateToken(token);
    if (!userId) {
      throw new UnauthorizedException('认证令牌无效或已过期');
    }

    const user = await this.findById(userId);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    return this.toUserResponse(user);
  }

  async getUserIdFromHeader(authorizationHeader: string | undefined): Promise<string> {
    const token = this.extractTokenFromHeader(authorizationHeader);
    if (!token) {
      throw new UnauthorizedException('未提供认证令牌');
    }

    const userId = this.validateToken(token);
    if (!userId) {
      throw new UnauthorizedException('认证令牌无效或已过期');
    }

    return userId;
  }

  async verifyUserPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) return false;
    return this.verifyPassword(password, user.passwordHash);
  }
}
