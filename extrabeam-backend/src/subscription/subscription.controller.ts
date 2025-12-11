/**
 * -------------------------------------------------------------
 * Controller : subscription.controller.ts
 * Rôle :
 *   - Expose les endpoints Stripe Billing pour ExtraBeam
 *   - POST /subscription/:slug → créer une session Checkout Stripe
 *   - POST /subscription/webhook → recevoir les webhooks Stripe
 *
 * Ne doit PAS contenir de logique métier.
 * -------------------------------------------------------------
 */

import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthUser } from '../common/auth/auth.types';
import { User } from '../common/auth/decorators/user.decorator';
import { JwtAuthGuard } from '../common/auth/guards/jwt.guard';
import { SubscribeDto } from './dto/subscribe.dto';
import { SubscriptionService } from './subscription.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post(':slug')
  @UseGuards(JwtAuthGuard)
  async createCheckout(
    @Param('slug') slug: string,
    @Body() dto: SubscribeDto,
    @User() user: AuthUser,
  ) {
    return this.subscriptionService.createCheckout(slug, dto, user);
  }

  @Post('webhook')
  async handleWebhook(@Req() req: Request) {
    const signature = req.headers['stripe-signature'];
    return this.subscriptionService.handleWebhook(req, signature as string);
  }
}
