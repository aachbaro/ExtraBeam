/**
 * -------------------------------------------------------------
 * DTO : subscribe.dto.ts
 * Rôle :
 *   - Définir et valider le payload pour créer un abonnement Stripe
 * -------------------------------------------------------------
 */

import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum SubscriptionPlan {
  Monthly = 'monthly',
  Annual = 'annual',
}

export class SubscribeDto {
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan;

  @IsOptional()
  @IsString()
  referralCode?: string;
}
