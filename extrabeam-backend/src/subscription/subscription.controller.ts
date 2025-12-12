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
  Get,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthUser } from '../common/auth/auth.types';
import { StripeWebhookGuard } from '../common/auth/guards/stripe-webhook.guard';
import { User } from '../common/auth/decorators/user.decorator';
import { JwtAuthGuard } from '../common/auth/guards/jwt.guard';
import { StrictValidationPipe } from '../common/pipes/strict-validation.pipe';
import { SubscribeDto } from './dto/subscribe.dto';
import { SubscriptionService } from './subscription.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // -------------------------------------------------------------
  // 🔴 Stripe Webhook (RAW BODY, NO PIPES)
  // -------------------------------------------------------------
  @Post('webhook')
  @UseGuards(StripeWebhookGuard)
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

  // -------------------------------------------------------------
  // 🟢 Statut abonnement (JWT requis)
  // -------------------------------------------------------------
  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getStatus(@User() user: AuthUser) {
    return this.subscriptionService.getStatus(user);
  }

  // -------------------------------------------------------------
  // 🔵 Checkout (JWT requis)
  // -------------------------------------------------------------
  @Post(':slug')
  @UseGuards(JwtAuthGuard)
  @UsePipes(StrictValidationPipe)
  async createCheckout(
    @Param('slug') slug: string,
    @Body() dto: SubscribeDto,
    @User() user: AuthUser,
  ) {
    return this.subscriptionService.createCheckout(slug, dto, user);
  }
}
