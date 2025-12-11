/**
 * Helper Stripe : configuration + outils communs
 */

import Stripe from 'stripe';

import { SubscriptionPlan } from '../dto/subscribe.dto';

type MetadataInput = {
  entrepriseId: number;
  slug?: string | null;
  plan: SubscriptionPlan;
  userId?: string | null;
  referralCode?: string;
};

export function createStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY manquant');
  }

  return new Stripe(secretKey, {
    apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
  });
}

export function getPriceId(plan: SubscriptionPlan): string {
  const priceId =
    plan === SubscriptionPlan.Monthly
      ? process.env.STRIPE_PRICE_MONTHLY
      : process.env.STRIPE_PRICE_ANNUAL;

  if (!priceId) {
    throw new Error(`Price ID manquant pour le plan ${plan}`);
  }

  return priceId;
}

export function buildMetadata({
  entrepriseId,
  slug,
  plan,
  userId,
  referralCode,
}: MetadataInput): Record<string, string> {
  return {
    entreprise_id: entrepriseId.toString(),
    plan,
    ...(slug ? { slug } : {}),
    ...(userId ? { user_id: userId } : {}),
    ...(referralCode ? { referral_code: referralCode } : {}),
  };
}
