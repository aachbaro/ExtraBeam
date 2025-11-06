// src/factures/factures.module.ts
// -------------------------------------------------------------
// Module : Factures
// -------------------------------------------------------------
//
// 📌 Description :
//   - Agrège contrôleur + service pour la gestion des factures
//   - Dépend des modules Notifications et Payments (via forwardRef)
//
// -------------------------------------------------------------

import { Module, forwardRef } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { FacturesController } from './factures.controller';
import { FacturesService } from './factures.service';

@Module({
  imports: [
    forwardRef(() => PaymentsModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [FacturesController],
  providers: [FacturesService],
  exports: [FacturesService],
})
export class FacturesModule {}
