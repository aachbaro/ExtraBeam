// src/payments/payments.service.ts
// -------------------------------------------------------------
// Service : Paiements Stripe
// -------------------------------------------------------------

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import Stripe from 'stripe';

import { AccessService } from '../common/auth/access.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../common/auth/auth.types';
import type { FactureWithRelations } from '../factures/factures.service';
import type { Table } from '../types/aliases';

type EntrepriseRow = Table<'entreprise'>;
type FactureWithEntreprise = FactureWithRelations & {
  entreprise?: EntrepriseRow | null;
};

const ENTREPRISE_ROLES = new Set(['freelance', 'entreprise', 'admin']);
const FACTURE_SELECT =
  '*, entreprise:entreprise_id(*), missions(*, slots(*), entreprise:entreprise_id(*), client:client_id(*))';

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly accessService: AccessService,
    private readonly notificationsService: NotificationsService,
  ) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY manquant');
    }
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
    });
  }

  private ensureUser(user: AuthUser | null): asserts user is AuthUser {
    if (!user) {
      throw new UnauthorizedException('Authentification requise');
    }
  }

  async createCheckoutForFacture(
    factureId: number,
    user: AuthUser | null,
  ): Promise<{ url: string; sessionId: string; paymentIntent: string }> {
    this.ensureUser(user);
    if (!ENTREPRISE_ROLES.has(user.role ?? '')) {
      throw new ForbiddenException('Accès réservé aux entreprises');
    }

    const admin = this.supabaseService.getAdminClient();
    const { data, error } = await admin
      .from('factures')
      .select(FACTURE_SELECT)
      .eq('id', factureId)
      .returns<FactureWithEntreprise[]>()
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundException('Facture introuvable');
    }

    const entreprise =
      data.entreprise ??
      (await this.accessService.findEntreprise(String(data.entreprise_id)));
    if (!this.accessService.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }

    this.accessService.assertActiveSubscription(entreprise);

    if (!data.montant_ttc || data.montant_ttc <= 0) {
      throw new BadRequestException('Montant TTC invalide');
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      customer_creation: 'if_required',
      line_items: [
        {
          price_data: {
            currency: entreprise.devise?.toLowerCase() || 'eur',
            product_data: {
              name: `Facture ${data.numero}`,
              description: data.description || 'Mission freelance',
            },
            unit_amount: Math.round(Number(data.montant_ttc) * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_URL}/entreprise/${entreprise.slug}/factures/${data.id}?paid=1`,
      cancel_url: `${process.env.APP_URL}/entreprise/${entreprise.slug}/factures/${data.id}?canceled=1`,
      metadata: {
        facture_id: data.id.toString(),
        entreprise_id: entreprise.id.toString(),
        ...(data.mission_id ? { mission_id: data.mission_id.toString() } : {}),
      },
    });

    if (!session.url) {
      throw new InternalServerErrorException('Session Stripe sans URL');
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? '');

    const { error: updateError } = await admin
      .from('factures')
      .update({
        stripe_session_id: session.id,
        stripe_payment_intent: paymentIntentId || null,
        payment_link: session.url,
        status: 'pending_payment',
      })
      .eq('id', data.id);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    await this.notificationsService.sendFactureNotification(data.id, user);

    return {
      url: session.url,
      sessionId: session.id,
      paymentIntent: paymentIntentId,
    };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET as string,
      );
    } catch (error) {
      throw new UnauthorizedException(
        `Webhook Error: ${(error as Error).message}`,
      );
    }

    const admin = this.supabaseService.getAdminClient();

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const factureId = session.metadata?.facture_id;
      if (!factureId) {
        throw new NotFoundException('Facture manquante');
      }

      const { data, error } = await admin
        .from('factures')
        .select(FACTURE_SELECT)
        .eq('id', Number(factureId))
        .returns<FactureWithEntreprise[]>()
        .maybeSingle();

      if (error || !data) {
        throw new NotFoundException('Facture introuvable');
      }

      await admin
        .from('factures')
        .update({
          status: 'paid',
          stripe_session_id: session.id,
          stripe_payment_intent:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
        })
        .eq('id', Number(factureId));

      if (data.mission_id) {
        await admin
          .from('missions')
          .update({ status: 'paid' })
          .eq('id', data.mission_id);
      }

      const entreprise = data.entreprise ?? null;
      if (entreprise) {
        await this.notificationsService.notifyFactureCreated(data, entreprise);
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object;
      const factureId = intent.metadata?.facture_id;
      if (!factureId) {
        return;
      }

      await admin
        .from('factures')
        .update({ status: 'canceled' })
        .eq('id', Number(factureId));
    }
  }
}
