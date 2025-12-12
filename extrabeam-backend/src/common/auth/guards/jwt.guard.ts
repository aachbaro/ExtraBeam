// extrabeam-backend/src/common/auth/guards/jwt.guard.ts
// -------------------------------------------------------------
// Guard JWT global
// - Protège toutes les routes par défaut
// - Ignore explicitement les webhooks Stripe
// - Supporte le décorateur @Public()
// -------------------------------------------------------------

import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();

    // -------------------------------------------------------------
    // 🔴 BYPASS TOTAL pour les webhooks Stripe
    // (authentifiés par signature, PAS par JWT)
    // -------------------------------------------------------------
    if (request.originalUrl?.startsWith('/api/subscription/webhook')) {
      return true;
    }

    // -------------------------------------------------------------
    // 🟢 Routes publiques (@Public)
    // -------------------------------------------------------------
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // -------------------------------------------------------------
    // 🔒 Auth JWT standard
    // -------------------------------------------------------------
    return super.canActivate(context);
  }
}
