// src/payments/dto/subscribe.dto.ts
// -------------------------------------------------------------
// DTO : Démarrer un abonnement Stripe Checkout
// -------------------------------------------------------------
//
// 📌 Description :
//   - Valide le payload pour la création d'une session Checkout
//   - Gère le plan (mensuel ou annuel) et un éventuel code de parrainage
//
// -------------------------------------------------------------

import { IsEnum, IsOptional, IsString } from 'class-validator'

export enum SubscriptionPlan {
  Monthly = 'monthly',
  Annual = 'annual',
}

export class SubscribeDto {
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan

  @IsOptional()
  @IsString()
  referralCode?: string
}
