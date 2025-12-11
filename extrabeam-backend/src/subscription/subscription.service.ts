/**
 * -------------------------------------------------------------
 * Service : subscription.service.ts
 * Stripe Billing – Gestion des abonnements ExtraBeam
 * -------------------------------------------------------------
 * Rôle :
 *   - Charger l’entreprise par slug
 *   - Vérifier les permissions
 *   - Créer les sessions Stripe Checkout
 *   - Gérer les webhooks
 *   - Mettre à jour la table entreprise
 *
 * Ce fichier ne doit PAS :
 *   - Gérer les factures
 *   - Importer FacturesService
 *   - Importer PaymentsService
 *   - Créer des paiements à l’unité
 * -------------------------------------------------------------
 */

import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';

import { AccessService } from '../common/auth/access.service';
import type { AuthUser } from '../common/auth/auth.types';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { Table } from '../types/aliases';
import type { TablesUpdate } from '../types/database';
import { SubscribeDto, SubscriptionPlan } from './dto/subscribe.dto';
import {
  buildMetadata,
  createStripeClient,
  getPriceId,
} from './helpers/stripe.helpers';

type EntrepriseRow = Table<'entreprise'>;
type RawBodyRequest = Request & { rawBody?: Buffer };

type WebhookResponse = { received: true };

@Injectable()
export class SubscriptionService {
  private readonly stripe: Stripe;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly accessService: AccessService,
  ) {
    this.stripe = createStripeClient();
  }

  private ensureUser(user: AuthUser | null): asserts user is AuthUser {
    if (!user) {
      throw new UnauthorizedException('Authentification requise');
    }
  }

  private async loadEntrepriseBySlug(slug: string): Promise<EntrepriseRow> {
    const admin = this.supabaseService.getAdminClient();
    const { data, error } = await admin
      .from('entreprise')
      .select('*')
      .eq('slug', slug)
      .maybeSingle<EntrepriseRow>();

    if (error || !data) {
      throw new NotFoundException('Entreprise introuvable');
    }

    return data;
  }

  async getOrCreateStripeCustomer(entreprise: EntrepriseRow): Promise<string> {
    if (entreprise.stripe_customer_id) {
      return entreprise.stripe_customer_id;
    }

    const customer = await this.stripe.customers.create({
      email: entreprise.email,
      name: [entreprise.prenom, entreprise.nom].filter(Boolean).join(' ').trim(),
      metadata: {
        entreprise_id: entreprise.id.toString(),
        slug: entreprise.slug ?? '',
      },
    });

    const admin = this.supabaseService.getAdminClient();
    const update: TablesUpdate<'entreprise'> = {
      stripe_customer_id: customer.id,
    };
    const { error: updateError } = await admin
      .from('entreprise')
      .update(update)
      .eq('id', entreprise.id);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    return customer.id;
  }

  async createCheckout(slug: string, dto: SubscribeDto, user: AuthUser) {
    this.ensureUser(user);

    const entreprise = await this.loadEntrepriseBySlug(slug);
    if (!this.accessService.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }

    if (!entreprise.email) {
      throw new InternalServerErrorException('Email entreprise manquant');
    }

    const priceId = getPriceId(dto.plan);
    const customerId = await this.getOrCreateStripeCustomer(entreprise);

    if (dto.referralCode && !entreprise.referred_by) {
      const admin = this.supabaseService.getAdminClient();
      const referralUpdate: TablesUpdate<'entreprise'> = {
        referred_by: dto.referralCode,
      };
      const { error: referralError } = await admin
        .from('entreprise')
        .update(referralUpdate)
        .eq('id', entreprise.id);

      if (referralError) {
        throw new InternalServerErrorException(referralError.message);
      }
    }

    const metadata = buildMetadata({
      entrepriseId: entreprise.id,
      slug: entreprise.slug ?? slug,
      plan: dto.plan,
      userId: user.id,
      referralCode: dto.referralCode,
    });

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      success_url: `${process.env.APP_URL}/entreprise/${entreprise.slug ?? slug}/subscription/success`,
      cancel_url: `${process.env.APP_URL}/entreprise/${entreprise.slug ?? slug}/subscription/canceled`,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata,
    });

    if (!session.url) {
      throw new InternalServerErrorException('Session Stripe sans URL');
    }

    return { url: session.url, sessionId: session.id };
  }

  async handleWebhook(req: Request, signature: string): Promise<WebhookResponse> {
    if (!signature) {
      throw new UnauthorizedException('Signature Stripe manquante');
    }

    const requestWithRawBody = req as RawBodyRequest;
    const rawBody = requestWithRawBody.rawBody
      ? requestWithRawBody.rawBody
      : Buffer.from(JSON.stringify(req.body ?? {}));

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET as string,
      );
    } catch (error) {
      throw new UnauthorizedException(`Webhook Error: ${(error as Error).message}`);
    }

    if (event.type === 'checkout.session.completed') {
      await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    }

    return { received: true };
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    if (session.mode !== 'subscription') {
      return;
    }

    const entrepriseId = session.metadata?.entreprise_id;
    if (!entrepriseId) {
      throw new NotFoundException('Entreprise manquante dans les métadonnées');
    }

    const subscriptionId = session.subscription;
    if (!subscriptionId || typeof subscriptionId !== 'string') {
      throw new NotFoundException('Subscription Stripe manquante');
    }

    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const admin = this.supabaseService.getAdminClient();
    const { data: entreprise, error } = await admin
      .from('entreprise')
      .select('*')
      .eq('id', Number(entrepriseId))
      .maybeSingle<EntrepriseRow>();

    if (error || !entreprise) {
      throw new NotFoundException('Entreprise introuvable');
    }

    const plan = (session.metadata?.plan as SubscriptionPlan) ?? null;
    const referralCode = session.metadata?.referral_code;

    await this.updateEntrepriseOnSubscription(
      entreprise,
      subscription,
      plan,
      referralCode,
    );
  }

  private async updateEntrepriseOnSubscription(
    entreprise: EntrepriseRow,
    subscription: Stripe.Subscription,
    plan: SubscriptionPlan | null,
    referralCode?: string,
  ) {
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id ?? null;

    const update: TablesUpdate<'entreprise'> = {
      stripe_subscription_id: subscription.id,
      stripe_customer_id: entreprise.stripe_customer_id ?? customerId ?? undefined,
      subscription_status: subscription.status ?? null,
      subscription_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      subscription_plan: plan ?? entreprise.subscription_plan ?? null,
    };

    if (referralCode && !entreprise.referred_by) {
      update.referred_by = referralCode;
    }

    const admin = this.supabaseService.getAdminClient();
    const { error } = await admin
      .from('entreprise')
      .update(update)
      .eq('id', entreprise.id);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }
}
