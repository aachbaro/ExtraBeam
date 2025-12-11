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
  // 🔴 Webhook Stripe
  // -------------------------------------------------------------
  async handleWebhook(
    req: Request,
    signature: string,
  ): Promise<WebhookResponse> {
    if (!signature)
      throw new UnauthorizedException('Signature Stripe manquante');

    const rawBody =
      (req as RawBodyRequest).rawBody ??
      Buffer.from(JSON.stringify(req.body ?? {}));

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

    if (event.type === 'checkout.session.completed') {
      await this.handleCheckoutCompleted(event.data.object);
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
      throw new NotFoundException('Entreprise manquante dans les métadonnées');
    }

    const subscriptionId = session.subscription;
    if (!subscriptionId || typeof subscriptionId !== 'string') {
      throw new NotFoundException('Subscription Stripe manquante');
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
