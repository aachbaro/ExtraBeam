/**
 * -------------------------------------------------------------
 * DTO : subscribe.dto.ts
 * Rôle :
 *   - Définir et valider le payload pour créer un abonnement Stripe
 * -------------------------------------------------------------
 */

import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export enum SubscriptionPlan {
  Monthly = 'monthly',
  Annual = 'annual',
}

export enum CheckoutIntent {
  Subscribe = 'subscribe',
  Reactivate = 'reactivate',
  Change = 'change',
}

export class SubscribeDto {
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsIn(Object.values(CheckoutIntent))
  intent?: CheckoutIntent;

  @IsOptional()
  @IsString()
  referralCode?: string;
}
