// src/entreprises/slots/slots.service.ts
// -------------------------------------------------------------
// Service : Entreprises › Slots
// -------------------------------------------------------------
//
// 📌 Description :
//   - Gère toutes les opérations métiers liées aux créneaux horaires (slots)
//   - Lecture publique filtrée selon le statut des missions
//   - Création, mise à jour, suppression réservées aux propriétaires/admins
//
// 📍 Endpoints :
//   - GET    /api/entreprises/:ref/slots         → liste slots (publique / privée)
//   - POST   /api/entreprises/:ref/slots         → création slot (owner/admin)
//   - PUT    /api/entreprises/:ref/slots/:id     → mise à jour slot
//   - DELETE /api/entreprises/:ref/slots/:id     → suppression slot
//
// 🔒 Règles d’accès :
//   - Lecture (GET) :
//       • Public → retourne uniquement les slots liés à des missions validées, paid ou completed
//       • Owner/Admin → accès complet, avec flag "pending"/"active" selon statut mission
//   - Mutations (POST, PUT, DELETE) :
//       • Réservées à l’owner de l’entreprise ou un admin
//
// ⚙️ Dépendances :
//   - SupabaseService → requêtes base de données
//   - AccessService   → vérification des droits entreprise
//
// -------------------------------------------------------------

import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AccessService } from '../../common/auth/access.service';
import type { AuthUser } from '../../common/auth/auth.types';
import type { Database } from '../../types/database';

// -------------------------------------------------------------
// Typages Supabase
// -------------------------------------------------------------
type SlotRow = Database['public']['Tables']['slots']['Row'];
type SlotInsert = Database['public']['Tables']['slots']['Insert'];
type SlotUpdate = Database['public']['Tables']['slots']['Update'];
type MissionRow = Database['public']['Tables']['missions']['Row'];
type EntrepriseRow = Database['public']['Tables']['entreprise']['Row'];

// -------------------------------------------------------------
// Service principal
// -------------------------------------------------------------
@Injectable()
export class SlotsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly accessService: AccessService,
  ) {}

  // -------------------------------------------------------------
  // 📅 Liste des slots (publique ou privée)
  // -------------------------------------------------------------
  async listSlots(
    ref: string,
    user: AuthUser | null,
    params: { from?: string; to?: string; missionId?: string },
  ): Promise<(SlotRow & { status_slot?: string })[]> {
    const admin = this.supabaseService.getAdminClient();

    // 🔍 Trouve l’entreprise ciblée
    const entreprise = await this.accessService.findEntreprise(ref);
    if (!entreprise) throw new NotFoundException('Entreprise introuvable');

    // 🔎 Requête de base
    let query = admin
      .from('slots')
      .select('*, missions:mission_id(status)')
      .eq('entreprise_id', entreprise.id)
      .order('start', { ascending: true });

    if (params.missionId)
      query = query.eq('mission_id', Number(params.missionId));
    if (params.from) query = query.gte('start', params.from);
    if (params.to) query = query.lte('end', params.to);

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);

    let slots =
      (data as (SlotRow & { missions?: { status: string | null } })[]) ?? [];

    // 🔒 Filtrage selon droits d’accès
    const canAccess = user
      ? this.accessService.canAccessEntreprise(user, entreprise)
      : false;

    if (!canAccess) {
      // 🌍 Public → slots uniquement de missions validées ou terminées
      slots = slots.filter(
        (s) =>
          !s.mission_id ||
          ['validated', 'paid', 'completed'].includes(s.missions?.status ?? ''),
      );
    } else {
      // 👤 Owner/Admin → flag visuel selon statut mission
      slots = slots.map((s) => {
        const status = s.missions?.status ?? '';
        if (s.mission_id && ['proposed', 'refused'].includes(status)) {
          return { ...s, status_slot: 'pending' };
        }
        return { ...s, status_slot: 'active' };
      });

      this.accessService.assertActiveSubscription(entreprise);
    }

    return slots;
  }

  // -------------------------------------------------------------
  // ➕ Création d’un slot
  // -------------------------------------------------------------
  async createSlot(
    ref: string,
    body: { start: string; end: string; title?: string; mission_id?: number },
    user: AuthUser,
  ): Promise<{ slot: SlotRow }> {
    const admin = this.supabaseService.getAdminClient();

    // 🔍 Vérifie entreprise + droits
    const entreprise = await this.accessService.findEntreprise(ref);
    if (!entreprise) throw new NotFoundException('Entreprise introuvable');
    if (!this.accessService.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }
    this.accessService.assertActiveSubscription(entreprise);

    // 🔎 Validation de base
    const { start, end, title, mission_id } = body;
    if (!start || !end) {
      throw new BadRequestException('Les champs start et end sont requis');
    }

    // 🔗 Vérifie mission si fournie
    let missionId: number | null = null;
    if (mission_id) {
      const { data: mission, error: missionError } = await admin
        .from('missions')
        .select('id, entreprise_id')
        .eq('id', mission_id)
        .single<MissionRow>();

      if (missionError)
        throw new InternalServerErrorException(missionError.message);
      if (!mission || mission.entreprise_id !== entreprise.id) {
        throw new BadRequestException(
          'Mission invalide ou non liée à cette entreprise',
        );
      }
      missionId = mission.id;
    }

    // 💾 Insertion
    const { data, error } = await admin
      .from('slots')
      .insert({
        start,
        end,
        title: title ?? null,
        mission_id: missionId,
        entreprise_id: entreprise.id,
      } satisfies SlotInsert)
      .select('*')
      .single<SlotRow>();

    if (error) throw new InternalServerErrorException(error.message);
    return { slot: data };
  }

  // -------------------------------------------------------------
  // ✏️ Mise à jour d’un slot
  // -------------------------------------------------------------
  async updateSlot(
    ref: string,
    id: number,
    updates: Partial<SlotUpdate>,
    user: AuthUser,
  ): Promise<{ slot: SlotRow }> {
    const admin = this.supabaseService.getAdminClient();
    const entreprise = await this.accessService.findEntreprise(ref);
    if (!entreprise) throw new NotFoundException('Entreprise introuvable');

    if (!this.accessService.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }
    this.accessService.assertActiveSubscription(entreprise);

    const { data, error } = await admin
      .from('slots')
      .update(updates)
      .eq('id', id)
      .eq('entreprise_id', entreprise.id)
      .select('*')
      .single<SlotRow>();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Slot introuvable');
    return { slot: data };
  }

  // -------------------------------------------------------------
  // ❌ Suppression d’un slot
  // -------------------------------------------------------------
  async deleteSlot(ref: string, id: number, user: AuthUser): Promise<void> {
    const admin = this.supabaseService.getAdminClient();
    const entreprise = await this.accessService.findEntreprise(ref);
    if (!entreprise) throw new NotFoundException('Entreprise introuvable');

    if (!this.accessService.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }
    this.accessService.assertActiveSubscription(entreprise);

    const { error } = await admin
      .from('slots')
      .delete()
      .eq('id', id)
      .eq('entreprise_id', entreprise.id);

    if (error) throw new InternalServerErrorException(error.message);
  }
}
