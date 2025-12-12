/**
 * -------------------------------------------------------------
 * Service : subscription.service.ts
 * Stripe Billing – Gestion des abonnements ExtraBeam
 * -------------------------------------------------------------
 * Rôle :
 *   - Charger l’entreprise (slug)
 *   - Vérifier les permissions d’accès
 *   - Créer une session Stripe Checkout (abonnement)
 *   - Recevoir les webhooks Stripe Billing
 *   - Mettre à jour la table `entreprise` (status, plan, périodes)
 *
 * Ne gère PAS :
 *   - Les factures (paiements unitaires)
 *   - Les missions
 *   - Les paiements client → PaymentsService
 *
 * Dépendances :
 *   - Supabase (lecture/écriture DB)
 *   - AccessService (vérification permissions)
 *   - Stripe (Billing)
 * -------------------------------------------------------------
 */

import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
import type { SubscriptionStatusResponse } from './dto/subscription-status.dto';
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
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly accessService: AccessService,
  ) {
    this.stripe = createStripeClient();
  }

  private ensureUser(user: AuthUser | null): asserts user is AuthUser {
    if (!user) throw new UnauthorizedException('Authentification requise');
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

  private normalizeStatus(
    status: EntrepriseRow['subscription_status'],
  ): SubscriptionStatusResponse['status'] {
    const allowed: SubscriptionStatusResponse['status'][] = [
      'active',
      'trialing',
      'past_due',
      'canceled',
      'incomplete',
    ];

    if (status && allowed.includes(status as SubscriptionStatusResponse['status'])) {
      return status as SubscriptionStatusResponse['status'];
    }

    return 'incomplete';
  }

  // -------------------------------------------------------------
  // 🔵 Customer Stripe
  // -------------------------------------------------------------
  async getOrCreateStripeCustomer(entreprise: EntrepriseRow): Promise<string> {
    if (entreprise.stripe_customer_id) {
      return entreprise.stripe_customer_id;
    }

    const customer = await this.stripe.customers.create({
      email: entreprise.email,
      name: `${entreprise.prenom ?? ''} ${entreprise.nom ?? ''}`.trim(),
      metadata: {
        entreprise_id: entreprise.id.toString(),
        slug: entreprise.slug ?? '',
      },
    });

    const admin = this.supabaseService.getAdminClient();
    const update: TablesUpdate<'entreprise'> = {
      stripe_customer_id: customer.id,
    };

    const { error } = await admin
      .from('entreprise')
      .update(update)
      .eq('id', entreprise.id);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return customer.id;
  }

  // -------------------------------------------------------------
  // 🟢 Créer une session Stripe Checkout (abonnement)
  // -------------------------------------------------------------
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

    // 🟡 Si l’utilisateur passe un referral code → on l'enregistre une seule fois
    if (dto.referralCode && !entreprise.referred_by) {
      const admin = this.supabaseService.getAdminClient();

      const { error } = await admin
        .from('entreprise')
        .update({
          referred_by: dto.referralCode ?? null,
        } as TablesUpdate<'entreprise'>)
        .eq('id', entreprise.id);

      if (error) {
        throw new InternalServerErrorException(error.message);
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
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata,
      },
      success_url: `${process.env.APP_URL}/entreprise/${entreprise.slug ?? slug}/subscription/success`,
      cancel_url: `${process.env.APP_URL}/entreprise/${entreprise.slug ?? slug}/subscription/canceled`,
      metadata,
    });

    if (!session.url) {
      throw new InternalServerErrorException('Session Stripe sans URL');
    }

    return { url: session.url, sessionId: session.id };
  }

  // -------------------------------------------------------------
  // 📡 Statut abonnement pour le frontend
  // -------------------------------------------------------------
  async getStatus(user: AuthUser): Promise<SubscriptionStatusResponse> {
    this.ensureUser(user);

    const ref = this.accessService.resolveEntrepriseRef(user);
    if (!ref) {
      throw new NotFoundException('Entreprise introuvable');
    }

    const entreprise = await this.accessService.findEntreprise(ref);
    if (!this.accessService.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException("Accès interdit à l'entreprise");
    }

    const normalizedStatus = this.normalizeStatus(
      entreprise.subscription_status,
    );
    const periodEnd = entreprise.subscription_period_end ?? null;
    const periodEndDate = periodEnd ? new Date(periodEnd) : null;
    const isExpired =
      periodEndDate !== null &&
      Number.isFinite(periodEndDate.getTime()) &&
      periodEndDate.getTime() < Date.now();

    const isTrial = normalizedStatus === 'trialing';
    const isActiveStatus =
      normalizedStatus === 'active' || normalizedStatus === 'trialing';

    return {
      status: normalizedStatus,
      plan: (entreprise.subscription_plan as SubscriptionPlan | null) ?? null,
      periodEnd,
      isTrial,
      isActive: isActiveStatus && !isExpired,
    };
  }

  // -------------------------------------------------------------
  // 🔴 Webhook Stripe
  // -------------------------------------------------------------
  async handleWebhook(
    req: Request,
    signature: string,
  ): Promise<WebhookResponse> {
    if (!signature) {
      throw new UnauthorizedException('Signature Stripe manquante');
    }

    const rawRequest = req as RawBodyRequest;
    const rawBody = rawRequest.rawBody
      ? rawRequest.rawBody
      : Buffer.isBuffer(rawRequest.body)
        ? rawRequest.body
        : Buffer.from(JSON.stringify(rawRequest.body ?? {}));

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody, // ✅ BUFFER BRUT, NON MODIFIÉ
        signature,
        process.env.STRIPE_WEBHOOK_SECRET as string,
      );
    } catch (error) {
      throw new UnauthorizedException(
        `Webhook Error: ${(error as Error).message}`,
      );
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionEvent(
          event.data.object as Stripe.Subscription,
          event.type,
        );
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoiceEvent(
          event.data.object as Stripe.Invoice,
          true,
        );
        break;
      case 'invoice.payment_failed':
        await this.handleInvoiceEvent(
          event.data.object as Stripe.Invoice,
          false,
        );
        break;
      default:
        return { received: true };
    }

    return { received: true };
  }

  // -------------------------------------------------------------
  // 🟣 Gestion du checkout (webhook)
  // -------------------------------------------------------------
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    if (session.mode !== 'subscription') return;

    const entrepriseId = session.metadata?.entreprise_id;
    if (!entrepriseId) {
      this.logger.warn(
        '[Stripe][checkout.session.completed] Metadonnée entreprise manquante',
      );
      return;
    }

    const subscriptionId = session.subscription;
    if (!subscriptionId || typeof subscriptionId !== 'string') {
      this.logger.warn(
        '[Stripe][checkout.session.completed] Subscription Stripe manquante',
      );
      return;
    }

    // Récupération souscription Stripe
    const subscription =
      await this.stripe.subscriptions.retrieve(subscriptionId);

    const admin = this.supabaseService.getAdminClient();
    const { data: entreprise, error } = await admin
      .from('entreprise')
      .select('*')
      .eq('id', Number(entrepriseId))
      .maybeSingle<EntrepriseRow>();

    if (error || !entreprise) {
      this.logger.warn(
        `[Stripe][checkout.session.completed] Entreprise ${entrepriseId} introuvable`,
      );
      return;
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

  // -------------------------------------------------------------
  // 🟠 Gestion des subscriptions (création/màj/suppression)
  // -------------------------------------------------------------
  private async handleSubscriptionEvent(
    subscription: Stripe.Subscription,
    source: string,
  ) {
    const entreprise = await this.resolveEntrepriseFromSubscription(subscription);

    if (!entreprise) {
      this.logger.warn(
        `[Stripe][${source}] Impossible de lier la subscription ${subscription.id} à une entreprise`,
      );
      return;
    }

    const plan = this.inferPlanFromSubscription(subscription);
    const referralCode = subscription.metadata?.referral_code;

    await this.updateEntrepriseOnSubscription(
      entreprise,
      subscription,
      plan,
      referralCode ?? undefined,
    );

    this.logger.log(
      `[Stripe][${source}] Entreprise ${entreprise.id} mise à jour (${subscription.status})`,
    );
  }

  // -------------------------------------------------------------
  // 🧾 Gestion des factures (paiement réussi/échoué)
  // -------------------------------------------------------------
  private async handleInvoiceEvent(invoice: Stripe.Invoice, succeeded: boolean) {
    const subscriptionId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id;

    if (!subscriptionId) {
      this.logger.warn(
        `[Stripe][invoice.${succeeded ? 'payment_succeeded' : 'payment_failed'}] Subscription manquante`,
      );
      return;
    }

    try {
      const subscription =
        await this.stripe.subscriptions.retrieve(subscriptionId);
      await this.handleSubscriptionEvent(
        subscription,
        succeeded ? 'invoice.payment_succeeded' : 'invoice.payment_failed',
      );
    } catch (error) {
      this.logger.error(
        `[Stripe][invoice] Impossible de récupérer la subscription ${subscriptionId}: ${(error as Error).message}`,
      );
    }
  }

  // -------------------------------------------------------------
  // 🔎 Helpers de résolution Stripe → Entreprise
  // -------------------------------------------------------------
  private async resolveEntrepriseFromSubscription(
    subscription: Stripe.Subscription,
  ): Promise<EntrepriseRow | null> {
    const entrepriseId = subscription.metadata?.entreprise_id;
    if (entrepriseId) {
      const entreprise = await this.findEntrepriseById(entrepriseId);
      if (entreprise) return entreprise;
    }

    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id;

    if (customerId) {
      const entreprise = await this.findEntrepriseByCustomer(customerId);
      if (entreprise) return entreprise;
    }

    return null;
  }

  private async findEntrepriseById(
    entrepriseId: string | number,
  ): Promise<EntrepriseRow | null> {
    const admin = this.supabaseService.getAdminClient();
    const { data, error } = await admin
      .from('entreprise')
      .select('*')
      .eq('id', Number(entrepriseId))
      .maybeSingle<EntrepriseRow>();

    if (error || !data) return null;
    return data;
  }

  private async findEntrepriseByCustomer(
    customerId: string,
  ): Promise<EntrepriseRow | null> {
    const admin = this.supabaseService.getAdminClient();
    const { data, error } = await admin
      .from('entreprise')
      .select('*')
      .eq('stripe_customer_id', customerId)
      .maybeSingle<EntrepriseRow>();

    if (error || !data) return null;
    return data;
  }

  private inferPlanFromSubscription(
    subscription: Stripe.Subscription,
  ): SubscriptionPlan | null {
    const metadataPlan = subscription.metadata?.plan as
      | SubscriptionPlan
      | undefined;
    if (metadataPlan && Object.values(SubscriptionPlan).includes(metadataPlan)) {
      return metadataPlan;
    }

    const priceId = subscription.items?.data?.[0]?.price?.id;
    if (priceId) {
      const monthly = process.env.STRIPE_PRICE_MONTHLY;
      const annual = process.env.STRIPE_PRICE_ANNUAL;
      if (priceId === monthly) return SubscriptionPlan.Monthly;
      if (priceId === annual) return SubscriptionPlan.Annual;
    }

    return null;
  }

  // -------------------------------------------------------------
  // 🔵 Mise à jour entreprise après abonnement
  // -------------------------------------------------------------
  private async updateEntrepriseOnSubscription(
    entreprise: EntrepriseRow,
    subscription: Stripe.Subscription,
    plan: SubscriptionPlan | null,
    referralCode?: string,
  ) {
    // Stripe TS 2024 ne donne plus current_period_end → cast propre
    const s: any = subscription;
    const periodEnd = s.current_period_end
      ? new Date(s.current_period_end * 1000).toISOString()
      : null;

    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : (subscription.customer?.id ?? null);

    const update: TablesUpdate<'entreprise'> = {
      stripe_subscription_id: subscription.id,
      stripe_customer_id:
        entreprise.stripe_customer_id ?? customerId ?? undefined,
      subscription_status: subscription.status ?? null,
      subscription_period_end: periodEnd,
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
