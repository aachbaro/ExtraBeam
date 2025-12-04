// src/missions/missions.module.ts
// -------------------------------------------------------------
// Module : Missions
// -------------------------------------------------------------
//
// 📌 Description :
//   - Agrège le contrôleur et le service liés aux missions
//   - Exporte le service pour les modules dépendants (notifications, factures...)
//
// 📍 Contenu :
//   - MissionsController
//   - MissionsService
//
// 🔒 Règles d’accès :
//   - Guards appliqués dans le contrôleur (JwtAuthGuard)
//
// ⚠️ Remarques :
//   - Dépend des services partagés Auth/Supabase via AppModule
//
// -------------------------------------------------------------

import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';

@Module({
  imports: [NotificationsModule],
  controllers: [MissionsController],
  providers: [MissionsService],
  exports: [MissionsService],
})
export class MissionsModule {}
