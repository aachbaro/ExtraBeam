// src/notifications/notifications.service.ts
// -------------------------------------------------------------
// Service : Notifications (Mail)
// -------------------------------------------------------------
//
// 📌 Description :
//   - Orchestration des notifications e-mail métier (missions, factures)
//   - Gère la préparation des payloads (DTO) et délègue l’envoi au
//     `NotificationsService` du module mailer.
//
// 📍 Notifications gérées :
//   - 📄 Missions → création, mise à jour, statut
//   - 🧾 Factures → création, paiement, lien de règlement
//
// 🔒 Règles d’accès :
//   - Authentification requise (JWT Supabase)
//   - Vérification d’accès via AccessService.canAccessEntreprise
//
// ⚠️ Remarques :
//   - Aligné sur la refactorisation `facture.mission` (singulier)
//   - Requêtes Supabase strictement typées et sécurisées
//
// -------------------------------------------------------------

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AccessService } from '../common/auth/access.service';
import { NotificationsService as MailerNotificationsService } from '../common/mailer/notifications.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { AuthUser } from '../common/auth/auth.types';
import type {
  ClientDTO,
  EntrepriseDTO,
  FactureDTO,
  MissionDTO,
} from '../common/mailer/email-templates.service';
import type { FactureWithRelations } from '../factures/factures.service';
import type { Table } from '../types/aliases';

// -------------------------------------------------------------
// Typages internes
// -------------------------------------------------------------

type MissionWithRelations = Table<'missions'> & {
  slots?: Table<'slots'>[] | null;
  entreprise?: Table<'entreprise'> | null;
  client?: Table<'profiles'> | null;
};

type FactureMailPayload = FactureDTO & {
  mission?: {
    client?: Table<'profiles'> | null;
    contact_email?: string | null;
    client_id?: string | null;
  } | null;
  contact_email?: string | null;
  mission_id?: number | null;
};

type MissionMailerPayload = MissionDTO & {
  client?: Table<'profiles'> | null;
  client_id?: string | null;
  contact_email?: string | null;
};

// -------------------------------------------------------------
// Constantes de sélection
// -------------------------------------------------------------
const MISSION_SELECT =
  '*, slots(*), entreprise:entreprise_id(*), client:client_id(*)';
const FACTURE_SELECT =
  '*, mission:mission_id(*, slots(*), entreprise:entreprise_id(*), client:client_id(*))';

// -------------------------------------------------------------
// Implémentation du service
// -------------------------------------------------------------
@Injectable()
export class NotificationsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly accessService: AccessService,
    private readonly mailerNotifications: MailerNotificationsService,
  ) {}

  // -------------------------------------------------------------
  // 🔧 Mappers vers les DTOs mailer
  // -------------------------------------------------------------

  private toEntrepriseDTO(
    entreprise: Table<'entreprise'> | null,
  ): EntrepriseDTO {
    return {
      id: entreprise?.id ?? 0,
      nom: entreprise?.nom ?? null,
      prenom: entreprise?.prenom ?? null,
      email: entreprise?.email ?? null,
      telephone: entreprise?.telephone ?? null,
      slug: entreprise?.slug ?? null,
    };
  }

  private toMissionDTO(mission: MissionWithRelations): MissionDTO {
    return {
      id: mission.id,
      etablissement: mission.etablissement ?? null,
      instructions: mission.instructions ?? null,
      mode: mission.mode ?? null,
      status: mission.status ?? 'proposed',
      contact_name: mission.contact_name ?? null,
      contact_email: mission.contact_email ?? null,
      contact_phone: mission.contact_phone ?? null,
      slots: (mission.slots ?? []).map((slot) => ({
        start: slot.start ?? '',
        end: slot.end ?? '',
        title: slot.title ?? null,
      })),
    };
  }

  private toClientDTO(
    client: Table<'profiles'> | null,
    contactEmail?: string | null,
    contactName?: string | null,
  ): ClientDTO {
    const contact = contactName?.trim();

    if (!client)
      return {
        id: null,
        name: contact && contact.length > 0 ? contact : null,
        email: contactEmail ?? null,
      };

    const first = client.first_name ?? '';
    const last = client.last_name ?? '';
    const fullName = `${first} ${last}`.trim();

    const email = client.email ?? contactEmail ?? null;
    const name =
      fullName.length > 0
        ? fullName
        : contactName?.trim()?.length
          ? contactName
          : null;

    return {
      id: client.id ?? null,
      name,
      email,
    };
  }

  private toFactureDTO(facture: FactureWithRelations): FactureDTO {
    return {
      id: facture.id,
      numero: facture.numero,
      montant_ht: facture.montant_ht ?? null,
      montant_ttc: facture.montant_ttc ?? null,
      status: facture.status ?? 'pending_payment',
      payment_link: facture.payment_link ?? null,
    };
  }

  // -------------------------------------------------------------
  // 🧩 Construction des payloads
  // -------------------------------------------------------------
  private buildFactureMailPayload(
    facture: FactureWithRelations,
  ): FactureMailPayload {
    return {
      ...this.toFactureDTO(facture),
      mission: facture.mission
        ? {
            client: facture.mission.client ?? null,
            contact_email: facture.mission.contact_email ?? null,
            client_id: facture.mission.client_id ?? null,
          }
        : null,
      contact_email: facture.contact_email ?? null,
      mission_id: facture.mission_id ?? null,
    };
  }

  // -------------------------------------------------------------
  // 🧾 Notifications Factures
  // -------------------------------------------------------------
  async notifyFactureCreated(
    facture: FactureWithRelations,
    entreprise: Table<'entreprise'>,
  ): Promise<void> {
    const entrepriseDto = this.toEntrepriseDTO(entreprise);
    const factureMailPayload = this.buildFactureMailPayload(facture);

    // Envoi à l’entreprise
    await this.mailerNotifications.billingStatusChangedForEntreprise(
      entrepriseDto,
      factureMailPayload,
    );

    // Envoi au client
    await this.mailerNotifications.invoiceCreatedToClient(
      factureMailPayload,
      entrepriseDto,
    );
  }

  async sendFactureNotification(
    id: number,
    user: AuthUser | null,
  ): Promise<{ sent: true }> {
    if (!user) throw new ForbiddenException('Authentification requise');

    const admin = this.supabase.getAdminClient();

    const { data, error } = await admin
      .from('factures')
      .select(FACTURE_SELECT)
      .eq('id', id)
      .returns<FactureWithRelations[]>()
      .maybeSingle();

    if (error || !data) throw new NotFoundException('Facture introuvable');

    const entreprise =
      data.mission?.entreprise ??
      (await this.accessService.findEntreprise(String(data.entreprise_id)));

    if (!this.accessService.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }

    const entrepriseDto = this.toEntrepriseDTO(entreprise);
    const factureMailPayload = this.buildFactureMailPayload(data);

    await this.notifyFactureCreated(data, entreprise);

    if (factureMailPayload.payment_link) {
      await this.mailerNotifications.paymentLinkToClient(
        factureMailPayload,
        entrepriseDto,
      );
    }

    return { sent: true };
  }

  // -------------------------------------------------------------
  // 📄 Notifications Missions
  // -------------------------------------------------------------
  async sendMissionNotification(
    id: number,
    user: AuthUser | null,
  ): Promise<{ sent: true }> {
    if (!user) throw new ForbiddenException('Authentification requise');

    const admin = this.supabase.getAdminClient();
    const { data, error } = await admin
      .from('missions')
      .select(MISSION_SELECT)
      .eq('id', id)
      .returns<MissionWithRelations[]>()
      .maybeSingle();

    if (error || !data) throw new NotFoundException('Mission introuvable');

    const entreprise =
      data.entreprise ??
      (data.entreprise_id
        ? await this.accessService.findEntreprise(String(data.entreprise_id))
        : null);

    if (
      !entreprise ||
      !this.accessService.canAccessEntreprise(user, entreprise)
    ) {
      throw new ForbiddenException('Accès interdit');
    }

    const entrepriseDto = this.toEntrepriseDTO(entreprise);
    const missionDto = this.toMissionDTO(data);
    const clientDto = this.toClientDTO(
      data.client ?? null,
      data.contact_email,
      data.contact_name,
    );

    const missionMailPayload: MissionMailerPayload = {
      ...missionDto,
      client_id: data.client_id ?? null,
      client: data.client ?? null,
      contact_email: data.contact_email ?? null,
    };

    await this.mailerNotifications.missionStatusChangedToClient(
      missionMailPayload,
      entrepriseDto,
    );

    await this.mailerNotifications.missionAckToClient(
      clientDto,
      missionDto,
      entrepriseDto,
    );

    return { sent: true };
  }

  // -------------------------------------------------------------
  // 🚀 Notifications Missions (création)
  // -------------------------------------------------------------
  async notifyMissionCreated(mission: MissionWithRelations): Promise<void> {
    const entrepriseDto = this.toEntrepriseDTO(mission.entreprise ?? null);
    const missionDto = this.toMissionDTO(mission);
    const clientDto = this.toClientDTO(
      mission.client ?? null,
      mission.contact_email,
      mission.contact_name,
    );

    if (mission.client_id) {
      await this.mailerNotifications.missionCreatedByClient(
        entrepriseDto,
        missionDto,
        clientDto,
      );
    } else {
      await this.mailerNotifications.missionCreatedByVisitor(
        entrepriseDto,
        missionDto,
      );
    }

    await this.mailerNotifications.missionAckToClient(
      clientDto,
      missionDto,
      entrepriseDto,
    );
  }

  // -------------------------------------------------------------
  // ✅ Notifications Missions (acceptation)
  // -------------------------------------------------------------
  async notifyMissionAccepted(mission: MissionWithRelations): Promise<void> {
    const entrepriseDto = this.toEntrepriseDTO(mission.entreprise ?? null);
    const missionDto = this.toMissionDTO(mission);
    const missionMailPayload: MissionMailerPayload = {
      ...missionDto,
      client_id: mission.client_id ?? null,
      client: mission.client ?? null,
      contact_email: mission.contact_email ?? null,
    };

    await this.mailerNotifications.missionStatusChangedToClient(
      missionMailPayload,
      entrepriseDto,
    );
  }
}
