import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from "@lark-apaas/fullstack-nestjs-core";
import { eq, sql } from 'drizzle-orm';
import { atomsUsers } from '../../database/schema';
import type { User, BrandKit, FontStyle } from '@shared/api.interface';

interface UpdateProfileParams {
  username?: string;
  passwordHash?: string;
}

interface RechargePackage {
  key: string;
  credits: number;
  amount: number;
}

const RECHARGE_PACKAGES: RechargePackage[] = [
  { key: 'basic_100', credits: 100, amount: 10 },
  { key: 'standard_500', credits: 500, amount: 45 },
  { key: 'pro_1000', credits: 1000, amount: 80 },
];

@Injectable()
export class UserService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

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

  async updateProfile(userId: string, params: UpdateProfileParams): Promise<User> {
    const patch: Partial<typeof atomsUsers.$inferInsert> = {};

    if (params.username !== undefined) {
      const trimmed = params.username.trim();
      if (!trimmed) {
        throw new BadRequestException('用户名不能为空');
      }
      patch.username = trimmed;
    }

    if (params.passwordHash !== undefined) {
      patch.passwordHash = params.passwordHash;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    patch.updatedAt = new Date();

    const updated = await this.db
      .update(atomsUsers)
      .set(patch)
      .where(eq(atomsUsers.id, userId))
      .returning();

    if (updated.length === 0) {
      throw new NotFoundException('用户不存在');
    }

    return this.toUserResponse(updated[0]);
  }

  async recharge(userId: string, packageKey: string): Promise<{ credits: number; added: number; record: { credits: number; amount: number; packageKey: string; createdAt: string } }> {
    const pkg = RECHARGE_PACKAGES.find((p: RechargePackage) => p.key === packageKey);
    if (!pkg) {
      throw new BadRequestException('无效的套餐');
    }

    const record = {
      credits: pkg.credits,
      amount: pkg.amount,
      packageKey: pkg.key,
      createdAt: new Date().toISOString(),
    };

    const updated = await this.db
      .update(atomsUsers)
      .set({
        credits: sql`${atomsUsers.credits} + ${pkg.credits}`,
        rechargeHistory: sql`${atomsUsers.rechargeHistory} || ${JSON.stringify([record])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(atomsUsers.id, userId))
      .returning({ credits: atomsUsers.credits });

    if (updated.length === 0) {
      throw new NotFoundException('用户不存在');
    }

    return {
      credits: updated[0].credits,
      added: pkg.credits,
      record,
    };
  }

  async getBrandKit(userId: string): Promise<BrandKit> {
    const rows = await this.db.select().from(atomsUsers).where(eq(atomsUsers.id, userId));
    if (rows.length === 0) {
      throw new NotFoundException('用户不存在');
    }
    const user = rows[0];
    return {
      enabled: user.brandEnabled ?? false,
      brandName: user.brandName ?? '',
      primaryColor: user.brandPrimaryColor ?? '#7c3aed',
      secondaryColor: user.brandSecondaryColor ?? '#06b6d4',
      fontStyle: (user.brandFontStyle as FontStyle) ?? 'modern',
    };
  }

  async updateBrandKit(userId: string, brandKit: Partial<BrandKit>): Promise<BrandKit> {
    const patch: Partial<typeof atomsUsers.$inferInsert> = {};
    if (brandKit.enabled !== undefined) patch.brandEnabled = brandKit.enabled;
    if (brandKit.brandName !== undefined) patch.brandName = brandKit.brandName;
    if (brandKit.primaryColor !== undefined) patch.brandPrimaryColor = brandKit.primaryColor;
    if (brandKit.secondaryColor !== undefined) patch.brandSecondaryColor = brandKit.secondaryColor;
    if (brandKit.fontStyle !== undefined) patch.brandFontStyle = brandKit.fontStyle;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    patch.updatedAt = new Date();

    const updated = await this.db
      .update(atomsUsers)
      .set(patch)
      .where(eq(atomsUsers.id, userId))
      .returning();

    if (updated.length === 0) {
      throw new NotFoundException('用户不存在');
    }

    return {
      enabled: updated[0].brandEnabled ?? false,
      brandName: updated[0].brandName ?? '',
      primaryColor: updated[0].brandPrimaryColor ?? '#7c3aed',
      secondaryColor: updated[0].brandSecondaryColor ?? '#06b6d4',
      fontStyle: (updated[0].brandFontStyle as FontStyle) ?? 'modern',
    };
  }

  async deleteAccount(userId: string): Promise<void> {
    const deleted = await this.db
      .delete(atomsUsers)
      .where(eq(atomsUsers.id, userId))
      .returning({ id: atomsUsers.id });

    if (deleted.length === 0) {
      throw new NotFoundException('用户不存在');
    }
  }
}
