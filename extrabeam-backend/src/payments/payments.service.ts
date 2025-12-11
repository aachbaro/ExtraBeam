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
import { SubscriptionPlan, type SubscribeDto } from './dto/subscribe.dto';

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

  private getSiteUrl(): string {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {
      throw new InternalServerErrorException('NEXT_PUBLIC_SITE_URL manquant');
    }
    return siteUrl;
  }

  private getPriceId(plan: SubscriptionPlan): string {
    const monthlyId = process.env.STRIPE_PRICE_MONTHLY_ID;
    const annualId = process.env.STRIPE_PRICE_ANNUAL_ID;

    if (!monthlyId || !annualId) {
      throw new InternalServerErrorException('IDs Stripe des plans manquants');
    }

    return plan === SubscriptionPlan.Monthly ? monthlyId : annualId;
  }

  private async fetchEntrepriseBySlug(slug: string): Promise<EntrepriseRow> {
    const admin = this.supabaseService.getAdminClient();
    const { data, error } = await admin
      .from('entreprise')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .returns<EntrepriseRow>();

    if (error || !data) {
      throw new NotFoundException('Entreprise non trouvée');
    }

    return data;
  }

  private buildMetadata(
    entreprise: EntrepriseRow,
    plan: SubscriptionPlan,
    referralCode?: string,
  ): Record<string, string> {
    const metadata: Record<string, string> = {
      entreprise_id: entreprise.id?.toString() ?? '',
      slug: entreprise.slug ?? '',
      plan,
    };

    if (referralCode && referralCode.trim()) {
      metadata.referred_by = referralCode.trim();
    }

    return metadata;
  }

  private async getOrCreateStripeCustomer(
    entreprise: EntrepriseRow,
  ): Promise<string> {
    if (entreprise.stripe_customer_id) {
      return entreprise.stripe_customer_id;
    }

    const customer = await this.stripe.customers.create({
      email: entreprise.email ?? undefined,
      name: `${entreprise.prenom ?? ''} ${entreprise.nom ?? ''}`.trim(),
      metadata: {
        entreprise_id: entreprise.id?.toString() ?? '',
        slug: entreprise.slug ?? '',
      },
    });

    const admin = this.supabaseService.getAdminClient();
    const { error } = await admin
      .from('entreprise')
      .update({ stripe_customer_id: customer.id })
      .eq('id', entreprise.id);

    if (error) {
      throw new InternalServerErrorException(
        `Erreur lors de la sauvegarde du client Stripe: ${error.message}`,
      );
    }

    return customer.id;
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

  async createSubscriptionCheckout(
    slug: string,
    payload: SubscribeDto,
    user: AuthUser | null,
  ): Promise<{ url: string }> {
    this.ensureUser(user);

    const entreprise = await this.fetchEntrepriseBySlug(slug);
    if (!this.accessService.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }

    const priceId = this.getPriceId(payload.plan);
    const stripeCustomerId = await this.getOrCreateStripeCustomer(entreprise);
    const siteUrl = this.getSiteUrl();
    const metadata = this.buildMetadata(
      entreprise,
      payload.plan,
      payload.referralCode,
    );

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 30,
        metadata,
      },
      metadata,
      success_url: `${siteUrl}/abonnement/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/abonnement/cancel`,
    });

    if (!session.url) {
      throw new InternalServerErrorException('Session Stripe sans URL');
    }

    return { url: session.url };
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
      const session = event.data.object as Stripe.Checkout.Session;
      const factureId = session.metadata?.facture_id;

      if (factureId) {
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

        return;
      }

      if (session.mode === 'subscription') {
        const entrepriseId = session.metadata?.entreprise_id;
        const plan = session.metadata?.plan as SubscriptionPlan | undefined;
        const referredBy = session.metadata?.referred_by;

        if (!entrepriseId || !plan) {
          throw new NotFoundException('Données abonnement manquantes');
        }

        if (!Object.values(SubscriptionPlan).includes(plan)) {
          throw new BadRequestException('Plan abonnement invalide');
        }

        const { data: entreprise, error: entrepriseError } = await admin
          .from('entreprise')
          .select('*')
          .eq('id', Number(entrepriseId))
          .returns<EntrepriseRow>()
          .maybeSingle();

        if (entrepriseError || !entreprise) {
          throw new NotFoundException('Entreprise introuvable');
        }

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;

        if (!subscriptionId) {
          throw new InternalServerErrorException(
            'Subscription ID manquant dans la session Stripe',
          );
        }

        const subscription = await this.stripe.subscriptions.retrieve(
          subscriptionId,
        );

        await admin
          .from('entreprise')
          .update({
            stripe_subscription_id: subscription.id,
            subscription_status: 'trialing',
            subscription_plan: plan,
            subscription_period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
          })
          .eq('id', entreprise.id);

        if (referredBy) {
          const { data: refEntreprise } = await admin
            .from('entreprise')
            .select('id, referral_rewards_pending')
            .eq('referral_code', referredBy)
            .maybeSingle();

          if (refEntreprise) {
            await admin
              .from('entreprise')
              .update({
                referral_rewards_pending:
                  (refEntreprise.referral_rewards_pending ?? 0) + 1,
              })
              .eq('id', refEntreprise.id);
          }
        }
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
