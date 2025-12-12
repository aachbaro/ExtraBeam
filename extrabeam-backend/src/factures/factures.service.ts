// src/factures/factures.service.ts
// -------------------------------------------------------------
// Service : Factures
// -------------------------------------------------------------
//
// 📌 Description :
//   - Portage de l’ancienne API Vercel `/api/factures/*` vers NestJS
//   - Gère la création, la lecture, la mise à jour et l’envoi des factures
//   - Interface avec Stripe (PaymentsService) et Notifications
//
// 📍 Endpoints :
//   - GET    /api/factures                 → listFactures()
//   - GET    /api/factures/:id             → getFacture()
//   - POST   /api/factures                 → createFacture()
//   - PUT    /api/factures/:id             → updateFacture()
//   - POST   /api/factures/:id/send        → sendFacture()
//
// 🔒 Règles d’accès :
//   - Entreprise/Admin → accès complet à ses factures
//   - Client → lecture des factures liées à ses missions uniquement
//   - Vérification fine via AccessService (canAccessEntreprise)
//
// ⚠️ Remarques :
//   - Jointure correcte : `mission:mission_id(*)` (singulier)
//   - Les montants issus d’une mission sont recalculés au besoin
//   - Statut `paid` propage la mise à jour sur la mission liée
//
// -------------------------------------------------------------

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';

import { AccessService } from '../common/auth/access.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { FactureCreateDto } from './dto/facture-create.dto';
import { FactureUpdateDto } from './dto/facture-update.dto';
import type { AuthUser } from '../common/auth/auth.types';
import type { Insert, Table, Update } from '../types/aliases';

// -------------------------------------------------------------
// Typages DB
// -------------------------------------------------------------
type FactureRow = Table<'factures'>;
type FactureInsert = Insert<'factures'>;
type FactureUpdate = Update<'factures'>;
type MissionRow = Table<'missions'>;
type SlotRow = Table<'slots'>;
type EntrepriseRow = Table<'entreprise'>;
type ProfileRow = Table<'profiles'>;

type EntrepriseRole = 'freelance' | 'entreprise' | 'admin';

// -------------------------------------------------------------
// Constantes
// -------------------------------------------------------------
const ENTREPRISE_ROLES = new Set<EntrepriseRole>([
  'freelance',
  'entreprise',
  'admin',
]);

/** Jointure CORRECTE vers la mission liée (singulier) */
const FACTURE_SELECT =
  '*, mission:mission_id(*, slots(*), entreprise:entreprise_id(*), client:client_id(*))';

/** Modèle de sortie pour le service (mission au singulier) */
export type FactureWithRelations = FactureRow & {
  mission:
    | (MissionRow & {
        slots?: SlotRow[];
        entreprise?: EntrepriseRow | null;
        client?: ProfileRow | null;
      })
    | null;
};

@Injectable()
export class FacturesService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly accessService: AccessService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  // -------------------------------------------------------------
  // 🔒 Helpers d’accès
  // -------------------------------------------------------------
  private ensureUser(user: AuthUser | null): asserts user is AuthUser {
    if (!user) throw new UnauthorizedException('Authentification requise');
  }

  private assertEntrepriseRole(user: AuthUser) {
    if (!ENTREPRISE_ROLES.has((user.role ?? '') as EntrepriseRole)) {
      throw new ForbiddenException('Accès réservé aux entreprises');
    }
  }

  private async loadEntrepriseForUser(
    user: AuthUser,
    ref: string | number | null | undefined,
  ): Promise<EntrepriseRow> {
    const resolvedRef = this.accessService.resolveEntrepriseRef(user, ref);
    if (!resolvedRef)
      throw new BadRequestException('Référence entreprise manquante');

    const entreprise = await this.accessService.findEntreprise(resolvedRef);
    if (!this.accessService.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException("Accès interdit à l'entreprise");
    }
    this.accessService.assertActiveSubscription(entreprise);
    return entreprise;
  }

  // -------------------------------------------------------------
  // 🔎 Fetch unitaire
  // -------------------------------------------------------------
  private async fetchFacture(id: number): Promise<FactureWithRelations> {
    const admin = this.supabaseService.getAdminClient();

    const { data, error } = await admin
      .from('factures')
      .select(FACTURE_SELECT)
      .eq('id', id)
      .returns<FactureWithRelations[]>()
      .maybeSingle();

    if (error) {
      // PGRST116 : no rows
      if (error.code === 'PGRST116')
        throw new NotFoundException('Facture introuvable');
      throw new InternalServerErrorException(error.message);
    }
    if (!data) throw new NotFoundException('Facture introuvable');

    return data;
  }

  // -------------------------------------------------------------
  // 📖 Liste
  // -------------------------------------------------------------
  /** 🧾 Liste les factures visibles par l'entreprise authentifiée. */
  async listFactures(
    entrepriseRef: string,
    user: AuthUser | null,
    missionId?: number,
  ): Promise<FactureWithRelations[]> {
    this.ensureUser(user);

    if (user.role === 'client') {
      return this.listFacturesForClient(user, missionId);
    }
    this.assertEntrepriseRole(user);

    const entreprise = await this.loadEntrepriseForUser(user, entrepriseRef);
    const admin = this.supabaseService.getAdminClient();

    let query = admin
      .from('factures')
      .select(FACTURE_SELECT)
      .eq('entreprise_id', entreprise.id)
      .order('date_emission', { ascending: false });

    if (missionId) query = query.eq('mission_id', missionId);

    const { data, error } = await query.returns<FactureWithRelations[]>();

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  /** 🧾 Liste les factures visibles par un client (missions associées). */
  private async listFacturesForClient(
    user: AuthUser,
    missionId?: number,
  ): Promise<FactureWithRelations[]> {
    const admin = this.supabaseService.getAdminClient();

    let query = admin
      .from('factures')
      .select(FACTURE_SELECT)
      .eq('mission.client_id', user.id)
      .order('date_emission', { ascending: false });

    if (missionId) query = query.eq('mission_id', missionId);

    const { data, error } = await query.returns<FactureWithRelations[]>();

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  // -------------------------------------------------------------
  // 🔍 Détail
  // -------------------------------------------------------------
  /** 🔍 Récupère une facture après vérification des droits d'accès. */
  async getFacture(
    id: number,
    user: AuthUser | null,
  ): Promise<FactureWithRelations> {
    this.ensureUser(user);

    const facture = await this.fetchFacture(id);
    const role = user.role ?? '';

    if (ENTREPRISE_ROLES.has(role as EntrepriseRole)) {
      const entreprise =
        facture.mission?.entreprise ??
        (await this.accessService.findEntreprise(
          String(facture.entreprise_id),
        ));

      if (!this.accessService.canAccessEntreprise(user, entreprise)) {
        throw new ForbiddenException('Accès interdit');
      }
    } else if (role === 'client') {
      if (facture.mission?.client_id !== user.id) {
        throw new ForbiddenException('Facture inaccessible');
      }
    } else {
      throw new ForbiddenException('Rôle non autorisé');
    }

    return facture;
  }

  // -------------------------------------------------------------
  // 🧮 Calculs issus d’une mission
  // -------------------------------------------------------------
  private async computeFromMission(
    missionId: number,
    entrepriseId: number,
  ): Promise<{
    hours: number;
    rate: number;
    montant_ht: number;
    montant_ttc: number;
  }> {
    const admin = this.supabaseService.getAdminClient();

    type SlotTiming = Pick<SlotRow, 'start' | 'end'>;

    const { data: slots, error: slotsError } = await admin
      .from('slots')
      .select('start, end')
      .eq('mission_id', missionId)
      .returns<SlotTiming[]>();

    if (slotsError) throw new InternalServerErrorException(slotsError.message);

    let totalHours = 0;
    for (const slot of slots ?? []) {
      if (slot.start && slot.end) {
        const start = new Date(slot.start).getTime();
        const end = new Date(slot.end).getTime();
        if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
          totalHours += (end - start) / (1000 * 60 * 60);
        }
      }
    }

    const entreprise = await this.accessService.findEntreprise(
      String(entrepriseId),
    );
    const rate = entreprise.taux_horaire ?? 0;
    const montant_ht = totalHours * rate;

    return {
      hours: totalHours,
      rate,
      montant_ht,
      // Par défaut TTC = HT si TVA non applicable
      montant_ttc: montant_ht,
    };
  }

  // -------------------------------------------------------------
  // ➕ Création
  // -------------------------------------------------------------
  /** 🧾 Crée une facture pour une entreprise donnée (recalcule si mission liée). */
  async createFacture(
    input: FactureCreateDto,
    user: AuthUser | null,
  ): Promise<FactureWithRelations> {
    this.ensureUser(user);
    this.assertEntrepriseRole(user);

    const entreprise = await this.loadEntrepriseForUser(
      user,
      input.entreprise_id,
    );

    const admin = this.supabaseService.getAdminClient();
    const {
      generatePaymentLink,
      entreprise_id: _ignored,
      mission_id,
      ...rest
    } = input;

    const payload: FactureInsert = {
      ...rest,
      entreprise_id: entreprise.id,
      mission_id: mission_id ?? null,
    };

    if (payload.mission_id) {
      const { hours, rate, montant_ht, montant_ttc } =
        await this.computeFromMission(payload.mission_id, entreprise.id);
      payload.hours = hours;
      payload.rate = rate;
      payload.montant_ht = montant_ht;
      payload.montant_ttc = payload.montant_ttc ?? montant_ttc;
      payload.tva = payload.tva ?? 0;

      if (payload.tva && payload.tva > 0) {
        // Si tu gères une vraie TVA, remplace par (HT * (1 + taux))
        payload.montant_ttc = montant_ht + payload.tva;
      }
    }

    const { data, error } = await admin
      .from('factures')
      .insert(payload)
      .select()
      .returns<FactureRow[]>()
      .single();

    if (error) {
      if (error.code === '23505')
        throw new BadRequestException('Numéro de facture déjà utilisé');
      throw new InternalServerErrorException(error.message);
    }

    if (generatePaymentLink) {
      await this.paymentsService.createCheckoutForFacture(data.id, user);
    }

    const facture = await this.fetchFacture(data.id);

    // Notifications non bloquantes
    try {
      await this.notificationsService.notifyFactureCreated(facture, entreprise);
    } catch (e) {
      console.warn('Notification facture échouée:', (e as Error).message);
    }

    return facture;
  }

  // -------------------------------------------------------------
  // ✏️ Mise à jour
  // -------------------------------------------------------------
  /** ✏️ Met à jour une facture existante (et propage le statut payé). */
  async updateFacture(
    id: number,
    input: FactureUpdateDto,
    user: AuthUser | null,
  ): Promise<FactureWithRelations> {
    this.ensureUser(user);

    const facture = await this.fetchFacture(id);
    const role = user.role ?? '';

    if (!ENTREPRISE_ROLES.has(role as EntrepriseRole)) {
      throw new ForbiddenException('Accès réservé au propriétaire');
    }

    const entreprise = await this.accessService.findEntreprise(
      String(facture.entreprise_id),
    );
    if (!this.accessService.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }
    this.accessService.assertActiveSubscription(entreprise);

    const admin = this.supabaseService.getAdminClient();
    const { mission_id, ...rest } = input;

    const payload: FactureUpdate = {
      ...rest,
      mission_id: mission_id ?? null,
    };

    const { error } = await admin
      .from('factures')
      .update(payload)
      .eq('id', id)
      .eq('entreprise_id', facture.entreprise_id);

    if (error) {
      if (error.code === '23505')
        throw new BadRequestException('Numéro de facture déjà utilisé');
      throw new InternalServerErrorException(error.message);
    }

    // Si facture marquée payée → mission payée
    if (payload.status === 'paid' && (facture.mission_id ?? mission_id)) {
      const missionToUpdate = mission_id ?? facture.mission_id!;
      await admin
        .from('missions')
        .update({ status: 'paid' })
        .eq('id', missionToUpdate);
    }

    return this.fetchFacture(id);
  }

  // -------------------------------------------------------------
  // ✉️ Envoi
  // -------------------------------------------------------------
  /** ✉️ Déclenche l'envoi d'une facture au client final. */
  async sendFacture(
    id: number,
    user: AuthUser | null,
  ): Promise<{ sent: true }> {
    this.ensureUser(user);

    const facture = await this.fetchFacture(id);
    const entreprise = await this.accessService.findEntreprise(
      String(facture.entreprise_id),
    );

    if (!this.accessService.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }

    this.accessService.assertActiveSubscription(entreprise);

    await this.notificationsService.sendFactureNotification(id, user);
    return { sent: true };
  }
}
