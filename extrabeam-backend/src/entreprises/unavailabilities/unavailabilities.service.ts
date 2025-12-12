// src/entreprises/unavailabilities/unavailabilities.service.ts
// -------------------------------------------------------------
// Service : Entreprises › Indisponibilités
// -------------------------------------------------------------
//
// 📌 Description :
//   - Liste, crée, modifie et supprime les indisponibilités
//   - Reproduit fidèlement la logique des anciennes routes serverless
//
// 🔒 Règles d’accès :
//   - GET : public
//   - POST / PUT / DELETE : owner/admin uniquement
//
// -------------------------------------------------------------

import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';

import { SupabaseService } from '../../common/supabase/supabase.service';
import { AccessService } from '../../common/auth/access.service';
import type { AuthUser } from '../../common/auth/auth.types';
import type { Database } from '../../types/database';

type UnavailabilityRow =
  Database['public']['Tables']['unavailabilities']['Row'];
type UnavailabilityInsert =
  Database['public']['Tables']['unavailabilities']['Insert'];
type UnavailabilityUpdate =
  Database['public']['Tables']['unavailabilities']['Update'];

@Injectable()
export class UnavailabilitiesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly access: AccessService,
  ) {}

  // -------------------------------------------------------------
  // 📅 Expansion des récurrences
  // -------------------------------------------------------------
  private expandRecurrences(
    items: UnavailabilityRow[],
    start: string,
    end: string,
  ): UnavailabilityRow[] {
    const from = new Date(start);
    const to = new Date(end);
    const expanded: UnavailabilityRow[] = [];

    for (const item of items) {
      const recurrence = item.recurrence_type;
      const exceptions = (item.exceptions as string[]) ?? [];

      const startRec = new Date(item.start_date);
      const endRec = item.recurrence_end
        ? new Date(item.recurrence_end)
        : new Date('2100-01-01');

      if (endRec < from || startRec > to) continue;

      const cursor = new Date(from);

      while (cursor <= to) {
        const iso = cursor.toISOString().split('T')[0];
        const dow = cursor.getUTCDay();
        let valid = false;

        switch (recurrence) {
          case 'none':
            valid = iso === item.start_date;
            break;

          case 'daily':
            valid = cursor >= startRec && cursor <= endRec;
            break;

          case 'weekly':
            valid =
              cursor >= startRec && cursor <= endRec && dow === item.weekday;
            break;

          case 'monthly':
            valid =
              cursor >= startRec &&
              cursor <= endRec &&
              cursor.getUTCDate() === new Date(item.start_date).getUTCDate();
            break;
        }

        if (valid && !exceptions.includes(iso)) {
          expanded.push({
            ...item,
            start_date: iso,
          });
        }

        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    return expanded;
  }

  // -------------------------------------------------------------
  // 📅 GET → Liste des indisponibilités
  // -------------------------------------------------------------
  async listUnavailabilities(
    ref: string,
    start: string,
    end: string,
    user: AuthUser | null,
  ) {
    const admin = this.supabase.getAdminClient();

    const entreprise = await this.access.findEntreprise(ref);
    if (!entreprise) throw new NotFoundException('Entreprise introuvable');

    const { data, error } = await admin
      .from('unavailabilities')
      .select('*')
      .eq('entreprise_id', entreprise.id);

    if (error) throw new InternalServerErrorException(error.message);

    return {
      unavailabilities: this.expandRecurrences(data ?? [], start, end),
    };
  }

  // -------------------------------------------------------------
  // ➕ POST → Création
  // -------------------------------------------------------------
  async createUnavailability(ref: string, body: any, user: AuthUser) {
    const admin = this.supabase.getAdminClient();

    const entreprise = await this.access.findEntreprise(ref);
    if (!entreprise) throw new NotFoundException('Entreprise introuvable');

    if (!this.access.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }
    this.access.assertActiveSubscription(entreprise);

    if (!body.start_time || !body.end_time || !body.start_date) {
      throw new BadRequestException(
        'start_time, end_time et start_date sont requis',
      );
    }

    const insertData: UnavailabilityInsert = {
      entreprise_id: entreprise.id,
      title: body.title ?? 'Unavailability',
      start_time: body.start_time,
      end_time: body.end_time,
      recurrence_type: body.recurrence_type ?? 'none',
      start_date: body.start_date,
      recurrence_end: body.recurrence_end ?? null,
      weekday: body.weekday ?? new Date(body.start_date).getUTCDay(),
      exceptions: body.exceptions ?? [],
    };

    const { data, error } = await admin
      .from('unavailabilities')
      .insert(insertData)
      .select('*')
      .single<UnavailabilityRow>();

    if (error) throw new InternalServerErrorException(error.message);

    return { unavailability: data };
  }

  // -------------------------------------------------------------
  // ✏️ PUT → Mise à jour
  // -------------------------------------------------------------
  async updateUnavailability(
    ref: string,
    id: number,
    updates: Partial<UnavailabilityUpdate>,
    user: AuthUser,
  ) {
    const admin = this.supabase.getAdminClient();

    const entreprise = await this.access.findEntreprise(ref);
    if (!entreprise) throw new NotFoundException('Entreprise introuvable');

    if (!this.access.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }
    this.access.assertActiveSubscription(entreprise);

    const { data, error } = await admin
      .from('unavailabilities')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('entreprise_id', entreprise.id)
      .select('*')
      .single<UnavailabilityRow>();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Indisponibilité introuvable');

    return { unavailability: data };
  }

  // -------------------------------------------------------------
  // ❌ DELETE → Suppression
  // -------------------------------------------------------------
  async deleteUnavailability(
    ref: string,
    id: number,
    date: string | undefined,
    user: AuthUser,
  ) {
    const admin = this.supabase.getAdminClient();

    const entreprise = await this.access.findEntreprise(ref);
    if (!entreprise) throw new NotFoundException('Entreprise introuvable');

    if (!this.access.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }
    this.access.assertActiveSubscription(entreprise);

    // suppression d’une occurrence d’une récurrence
    if (date) {
      const { data, error } = await admin
        .from('unavailabilities')
        .select('exceptions')
        .eq('id', id)
        .single();

      if (error) throw new InternalServerErrorException(error.message);

      const exceptions = (data?.exceptions as string[]) ?? [];
      if (!exceptions.includes(date)) exceptions.push(date);

      await admin
        .from('unavailabilities')
        .update({ exceptions })
        .eq('id', id)
        .eq('entreprise_id', entreprise.id);

      return { success: true, partial: true };
    }

    // suppression complète
    const { error } = await admin
      .from('unavailabilities')
      .delete()
      .eq('id', id)
      .eq('entreprise_id', entreprise.id);

    if (error) throw new InternalServerErrorException(error.message);

    return { success: true };
  }
}
