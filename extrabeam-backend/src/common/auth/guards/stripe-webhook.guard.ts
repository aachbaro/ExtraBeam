// src/common/auth/guards/stripe-webhook.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class StripeWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // Stripe n’utilise PAS de JWT
    // La sécurité est assurée par la signature Stripe
    return true;
  }
}
