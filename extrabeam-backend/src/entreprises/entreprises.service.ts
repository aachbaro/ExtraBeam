// src/entreprises/entreprises.service.ts
// -------------------------------------------------------------
// Service : Entreprises
// -------------------------------------------------------------
//
// 📌 Description :
//   - Encapsule la logique métier liée aux entreprises (lecture publique et privée)
//   - Interagit avec Supabase pour récupérer entreprises, missions, factures, slots, indisponibilités
//   - Vérifie les permissions d’accès via AccessService
//
// 🔒 Règles d’accès :
//   - Vue publique disponible sans authentification
//   - Vue propriétaire/admin disponible si canAccessEntreprise(user, entreprise)
//
// ⚠️ Remarques :
//   - Utilise les typages forts Supabase (Table<'table'>)
//   - Réplique la logique historique de l’API Vercel `/api/entreprises/[ref]/overview`
//
// -------------------------------------------------------------

import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { AccessService } from '../common/auth/access.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { AuthUser } from '../common/auth/auth.types';
import type { Table } from '../types/aliases';

// -------------------------------------------------------------
// Typing reference summary
// -------------------------------------------------------------
// - EntrepriseRow = Table<'entreprise'>
// - PublicEntreprise = Pick<EntrepriseRow, PUBLIC_ENTREPRISE_COLUMNS>
// - EntrepriseOverview = { mode: 'owner' | 'public'; ... }
// -------------------------------------------------------------

export type EntrepriseRow = Table<'entreprise'>;

const PUBLIC_ENTREPRISE_COLUMNS: Array<keyof EntrepriseRow> = [
  'id',
  'slug',
  'nom',
  'prenom',
  'adresse_ligne1',
  'adresse_ligne2',
  'ville',
  'code_postal',
  'pays',
  'email',
  'telephone',
  'taux_horaire',
  'devise',
  'created_at',
];

export const MISSION_SELECT =
  '*, slots(*), client:client_id(*), entreprise:entreprise_id(*)';

export type PublicEntreprise = Pick<
  EntrepriseRow,
  (typeof PUBLIC_ENTREPRISE_COLUMNS)[number]
>;

type MissionWithRelations = Table<'missions'> & {
  slots: Table<'slots'>[];
  client: Table<'profiles'> | null;
  entreprise: EntrepriseRow | null;
};

type SlotWithMission = Table<'slots'> & {
  missions?: {
    status: string | null;
  } | null;
};

export type EntrepriseDetail = { entreprise: Partial<EntrepriseRow> };

type EntrepriseOverviewOwner = {
  mode: 'owner';
  entreprise: EntrepriseRow;
  missions: MissionWithRelations[];
  factures: Table<'factures'>[];
  slots: Table<'slots'>[];
  unavailabilities: Table<'unavailabilities'>[];
};

type EntrepriseOverviewPublic = {
  mode: 'public';
  entreprise: PublicEntreprise;
  slots: SlotWithMission[];
  unavailabilities: Table<'unavailabilities'>[];
};

export type EntrepriseOverview =
  | EntrepriseOverviewOwner
  | EntrepriseOverviewPublic;

@Injectable()
export class EntreprisesService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly accessService: AccessService,
  ) {}

  /**
   * 🧩 Convertit un enregistrement entreprise complet en vue publique
   * Accepte `null` et `undefined` sans conflit de typage
   */
  private mapToPublicEntreprise(entreprise: EntrepriseRow): PublicEntreprise {
    const result = {} as Record<
      keyof PublicEntreprise,
      PublicEntreprise[keyof PublicEntreprise]
    >;

    for (const key of PUBLIC_ENTREPRISE_COLUMNS) {
      result[key] = entreprise[key] ?? null;
    }

    return result as PublicEntreprise;
  }

  private handleSupabaseError(
    error: unknown,
    notFoundMessage = 'Entreprise non trouvée',
  ): never {
    const supabaseError =
      typeof error === 'object' && error !== null
        ? (error as {
            code?: string;
            details?: unknown;
            message?: unknown;
          })
        : null;

    if (
      supabaseError?.code === 'PGRST116' ||
      (typeof supabaseError?.details === 'string' &&
        supabaseError.details.includes('Results contain 0 rows'))
    ) {
      throw new NotFoundException(notFoundMessage);
    }

    if (typeof supabaseError?.message === 'string') {
      throw new InternalServerErrorException(
        `Supabase error (${supabaseError.code ?? 'unknown'}): ${supabaseError.message}`,
      );
    }

    throw new InternalServerErrorException('Erreur Supabase');
  }

  private async fetchEntreprise(ref: string): Promise<EntrepriseRow> {
    try {
      const entreprise = await this.accessService.findEntreprise(ref);

      if (!entreprise) {
        throw new NotFoundException('Entreprise non trouvée');
      }

      return entreprise;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.handleSupabaseError(error);
    }
  }

  async getPublicEntreprises(): Promise<{ entreprises: PublicEntreprise[] }> {
    const client = this.supabaseService.getAdminClient();

    const { data, error } = await client
      .from('entreprise')
      .select(
        'id, slug, nom, prenom, adresse_ligne1, adresse_ligne2, ville, code_postal, pays, email, telephone, taux_horaire, devise, created_at',
      )
      .order('created_at', { ascending: false });

    if (error) {
      this.handleSupabaseError(
        error,
        'Impossible de récupérer les entreprises',
      );
    }

    return { entreprises: (data ?? []) as PublicEntreprise[] };
  }

  async getEntreprise(
    ref: string,
    user: AuthUser | null,
  ): Promise<EntrepriseDetail> {
    const entreprise = await this.fetchEntreprise(ref);
    const canAccessSensitive =
      !!user && this.accessService.canAccessEntreprise(user, entreprise);

    const baseData: Partial<EntrepriseRow> = {
      id: entreprise.id,
      slug: entreprise.slug,
      nom: entreprise.nom,
      prenom: entreprise.prenom,
      adresse_ligne1: entreprise.adresse_ligne1,
      adresse_ligne2: entreprise.adresse_ligne2,
      ville: entreprise.ville,
      code_postal: entreprise.code_postal,
      pays: entreprise.pays,
      email: entreprise.email,
      telephone: entreprise.telephone,
      taux_horaire: entreprise.taux_horaire,
      devise: entreprise.devise,
      created_at: entreprise.created_at,
      stripe_account_id: entreprise.stripe_account_id,
    };

    if (canAccessSensitive) {
      Object.assign(baseData, {
        siret: entreprise.siret,
        statut_juridique: entreprise.statut_juridique,
        tva_intracom: entreprise.tva_intracom,
        mention_tva: entreprise.mention_tva,
        iban: entreprise.iban,
        bic: entreprise.bic,
        conditions_paiement: entreprise.conditions_paiement,
        penalites_retard: entreprise.penalites_retard,
        updated_at: entreprise.updated_at,
      });
    }

    return { entreprise: baseData };
  }

  async getEntrepriseOverview(
    ref: string,
    user: AuthUser | null,
  ): Promise<EntrepriseOverview> {
    const entreprise = await this.fetchEntreprise(ref);
    const canAccessSensitive =
      !!user && this.accessService.canAccessEntreprise(user, entreprise);

    const client = this.supabaseService.getAdminClient();

    if (canAccessSensitive) {
      const [missions, factures, slots, unavailabilities] = await Promise.all([
        client
          .from('missions')
          .select(MISSION_SELECT)
          .eq('entreprise_id', entreprise.id)
          .order('created_at', { ascending: false }),
        client
          .from('factures')
          .select('*')
          .eq('entreprise_id', entreprise.id)
          .order('created_at', { ascending: false }),
        client
          .from('slots')
          .select('*')
          .eq('entreprise_id', entreprise.id)
          .order('start', { ascending: true }),
        client
          .from('unavailabilities')
          .select('*')
          .eq('entreprise_id', entreprise.id),
      ]);

      if (missions.error) {
        this.handleSupabaseError(
          missions.error,
          'Impossible de récupérer les missions',
        );
      }
      if (factures.error) {
        this.handleSupabaseError(
          factures.error,
          'Impossible de récupérer les factures',
        );
      }
      if (slots.error) {
        this.handleSupabaseError(
          slots.error,
          'Impossible de récupérer les slots',
        );
      }
      if (unavailabilities.error) {
        this.handleSupabaseError(
          unavailabilities.error,
          'Impossible de récupérer les indisponibilités',
        );
      }

      return {
        mode: 'owner' as const,
        entreprise,
        missions: (missions.data as MissionWithRelations[]) ?? [],
        factures: (factures.data as Table<'factures'>[]) ?? [],
        slots: (slots.data as Table<'slots'>[]) ?? [],
        unavailabilities:
          (unavailabilities.data as Table<'unavailabilities'>[]) ?? [],
      };
    }

    const [slots, unavailabilities] = await Promise.all([
      client
        .from('slots')
        .select('*, missions(status)')
        .eq('entreprise_id', entreprise.id),
      client
        .from('unavailabilities')
        .select('*')
        .eq('entreprise_id', entreprise.id),
    ]);

    if (slots.error) {
      this.handleSupabaseError(
        slots.error,
        'Impossible de récupérer les slots',
      );
    }
    if (unavailabilities.error) {
      this.handleSupabaseError(
        unavailabilities.error,
        'Impossible de récupérer les indisponibilités',
      );
    }

    const publicSlots = ((slots.data as SlotWithMission[]) ?? []).filter(
      (slot) => {
        if (!slot.mission_id) {
          return true;
        }

        const status = slot.missions?.status ?? '';
        return ['validated', 'paid', 'completed'].includes(status);
      },
    );

    return {
      mode: 'public' as const,
      entreprise: this.mapToPublicEntreprise(entreprise),
      slots: publicSlots,
      unavailabilities:
        (unavailabilities.data as Table<'unavailabilities'>[]) ?? [],
    };
  }
}
