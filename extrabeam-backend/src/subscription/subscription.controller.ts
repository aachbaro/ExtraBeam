// src/subscription/subscription.controller.ts
// -------------------------------------------------------------
// Controller : SubscriptionController
// Rôle :
//   - POST /api/subscription/:slug → créer une session Checkout Stripe
//   - POST /api/subscription/webhook → recevoir les webhooks Stripe
// ⚠️ Ne contient aucune logique métier (déléguée au service).
// -------------------------------------------------------------

import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
  Headers,
  HttpCode,
  BadRequestException,
  UsePipes,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthUser } from '../common/auth/auth.types';
import { StripeWebhookGuard } from '../common/auth/guards/stripe-webhook.guard';
import { User } from '../common/auth/decorators/user.decorator';
import { JwtAuthGuard } from '../common/auth/guards/jwt.guard';
import { SubscribeDto } from './dto/subscribe.dto';
import { SubscriptionService } from './subscription.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // -------------------------------------------------------------
  // 🔵 Checkout (JWT requis)
  // -------------------------------------------------------------
  @Post(':slug')
  @UseGuards(JwtAuthGuard)
  async createCheckout(
    @Param('slug') slug: string,
    @Body() dto: SubscribeDto,
    @User() user: AuthUser,
  ) {
    return this.subscriptionService.createCheckout(slug, dto, user);
  }

  // -------------------------------------------------------------
  // 🔴 Stripe Webhook (RAW BODY, NO PIPES)
  // -------------------------------------------------------------
  @Post('webhook')
  @UseGuards(StripeWebhookGuard)
  @UsePipes() // ⬅️ DÉSACTIVE TOUS LES PIPES (CRUCIAL)
  @HttpCode(200)
  async webhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    return this.subscriptionService.handleWebhook(req, signature);
  }
}
