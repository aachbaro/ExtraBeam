// src/entreprises/slots/slots.module.ts
// -------------------------------------------------------------
// Module : Entreprises › Slots
// -------------------------------------------------------------
//
// 📌 Description :
//   - Encapsule toute la logique liée aux créneaux horaires (slots) d’une entreprise
//   - Regroupe le contrôleur, le service métier et les dépendances nécessaires
//
// 📍 Composition :
//   - Controllers : SlotsController
//   - Providers   : SlotsService, SupabaseService, AccessService
//
// 🔒 Règles d’accès :
//   - Accès public en lecture (GET) → slots filtrés selon statut mission
//   - Accès propriétaire/admin en écriture (POST, PUT, DELETE)
//
// ⚙️ Dépendances :
//   - SupabaseService : gestion de la base de données
//   - AccessService   : vérification des droits d’accès à l’entreprise
//
// -------------------------------------------------------------

import { Module } from '@nestjs/common';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AccessService } from '../../common/auth/access.service';

@Module({
  controllers: [SlotsController],
  providers: [SlotsService, SupabaseService, AccessService],
  exports: [SlotsService],
})
export class SlotsModule {}
