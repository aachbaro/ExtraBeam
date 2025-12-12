// src/common/auth/access.service.ts
// -------------------------------------------------------------
// Service : AccessService
// -------------------------------------------------------------
//
// 📌 Description :
//   - Centralise la logique d’accès et de résolution des entreprises
//   - Fournit :
//       • resolveEntrepriseRef() → unifie la détection du ref (slug, id ou user.id)
//       • findEntreprise() → récupère une entreprise par ref
//       • canAccessEntreprise() → vérifie les permissions utilisateur
//
// 🔒 Règles d’accès :
//   - Un utilisateur admin a un accès total
//   - L’owner (user_id) a accès à son entreprise
//   - Les autres utilisateurs sont refusés
//
// ⚙️ Dépendances :
//   - SupabaseService pour les requêtes SQL
//
// -------------------------------------------------------------

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { SupabaseService } from '../supabase/supabase.service';
import type { AuthUser } from './auth.types';
import type { Table } from '../../types/aliases';

// -------------------------------------------------------------
// 🧩 Typage Supabase
// -------------------------------------------------------------
type EntrepriseRow = Table<'entreprise'>;

// -------------------------------------------------------------
// 🚀 Service principal
// -------------------------------------------------------------
@Injectable()
export class AccessService {
  constructor(private readonly supabase: SupabaseService) {}

  // -------------------------------------------------------------
  // 🧭 Résolution automatique de la référence entreprise
  // -------------------------------------------------------------
  resolveEntrepriseRef(
    user: AuthUser,
    ref?: string | number | null,
  ): string | null {
    const normalizedRef = typeof ref === 'string' ? ref.trim() : (ref ?? null);

    const resolved =
      normalizedRef !== null && normalizedRef !== ''
        ? normalizedRef
        : (user.slug ?? user.id ?? null);

    return resolved === null ? null : String(resolved);
  }

  // -------------------------------------------------------------
  // 🔍 Recherche d’une entreprise (id numérique ou slug)
  // -------------------------------------------------------------
  async findEntreprise(ref: string): Promise<EntrepriseRow> {
    const admin = this.supabase.getAdminClient();

    const query = ref.match(/^[0-9]+$/)
      ? admin
          .from('entreprise')
          .select('*')
          .eq('id', Number(ref))
          .maybeSingle()
          .returns<EntrepriseRow>()
      : admin
          .from('entreprise')
          .select('*')
          .eq('slug', ref)
          .maybeSingle()
          .returns<EntrepriseRow>();

    const { data, error } = await query;

    if (error || !data) {
      throw new NotFoundException('Entreprise non trouvée');
    }

    return data;
  }

  // -------------------------------------------------------------
  // 🔒 Vérification d’accès
  // -------------------------------------------------------------
  canAccessEntreprise(
    user: AuthUser | null,
    entreprise: EntrepriseRow,
  ): boolean {
    if (!user) {
      return false;
    }

    if (user.role === 'admin') {
      return true;
    }

    return user.id === entreprise.user_id;
  }

  // -------------------------------------------------------------
  // ✅ Vérification abonnement actif centralisée
  // -------------------------------------------------------------
  assertActiveSubscription(entreprise: EntrepriseRow): void {
    if (
      !['active', 'trialing'].includes(entreprise.subscription_status ?? '')
    ) {
      throw new ForbiddenException('Abonnement requis');
    }

    if (entreprise.subscription_period_end) {
      const periodEnd = new Date(entreprise.subscription_period_end);
      if (Number.isFinite(periodEnd.getTime()) && periodEnd < new Date()) {
        throw new ForbiddenException('Abonnement expiré');
      }
    }
  }
}
