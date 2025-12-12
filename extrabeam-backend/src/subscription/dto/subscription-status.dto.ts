import type { SubscriptionPlan } from './subscribe.dto'

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'

export interface SubscriptionStatusResponse {
  status: SubscriptionStatus
  plan: SubscriptionPlan | null
  periodEnd: string | null
  isTrial: boolean
  isActive: boolean
}
