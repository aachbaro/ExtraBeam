// src/entreprises/unavailabilities/unavailabilities.module.ts
// -------------------------------------------------------------
// Module : Entreprises › Indisponibilités
// -------------------------------------------------------------
//
// 📌 Description :
//   - Centralise le contrôleur et le service de gestion des indisponibilités
//   - Sert de base pour ajouter les règles métier et validations spécifiques
//
// 🔌 Composition :
//   - Controllers : UnavailabilitiesController
//   - Providers  : UnavailabilitiesService
//
// ⚠️ Remarques :
//   - Squelette initial en attente de la migration complète des routes historiques
//
// -------------------------------------------------------------

import { Module, forwardRef } from '@nestjs/common';
import { UnavailabilitiesController } from './unavailabilities.controller';
import { UnavailabilitiesService } from './unavailabilities.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AccessService } from '../../common/auth/access.service';

@Module({
  controllers: [UnavailabilitiesController],
  providers: [UnavailabilitiesService, SupabaseService, AccessService],
  exports: [UnavailabilitiesService],
})
export class UnavailabilitiesModule {}
