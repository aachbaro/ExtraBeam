/**
 * Module : SubscriptionModule
 * Rôle : regrouper controller + service pour Stripe Billing
 */

import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../common/auth/auth.module';
import { SupabaseModule } from '../common/supabase/supabase.module';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';

@Module({
  imports: [SupabaseModule, AuthCommonModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
