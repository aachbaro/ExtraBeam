// src/client-contacts/client-contacts.service.ts
// -------------------------------------------------------------
// Service : Contacts client (extras favoris)
// -------------------------------------------------------------
//
// 📌 Description :
//   - Portage NestJS des endpoints historiques `/api/clients/contacts`
//   - Gestion des favoris côté clients (liste, ajout, suppression)
//
// 📍 Endpoints :
//   - GET    /api/clients/contacts
//   - POST   /api/clients/contacts
//   - DELETE /api/clients/contacts/:id
//
// 🔒 Règles d’accès :
//   - Authentification JWT obligatoire
//   - Rôle `client` uniquement
// -------------------------------------------------------------

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthUser } from '../common/auth/auth.types';
import { NotificationsService as MailerNotifications } from '../common/mailer/notifications.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { Tables } from '../common/types/database';
import type { Insert, Table } from '../types/aliases';
import type { CreateClientContactDto } from './dto/create-client-contact.dto';

// -------------------------------------------------------------
// Typages internes
// -------------------------------------------------------------
type ClientContactRow = Table<'client_contacts'>;
type ClientContactInsert = Insert<'client_contacts'>;
type ClientContactWithEntreprise = ClientContactRow & {
  entreprise: Table<'entreprise'> | null;
};

type EntrepriseDTO = Tables<'entreprise'>;

// -------------------------------------------------------------
// Service principal
// -------------------------------------------------------------
@Injectable()
export class ClientContactsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly mailerNotifications: MailerNotifications,
  ) {}

  private ensureClient(user: AuthUser | null): asserts user is AuthUser {
    if (!user) {
      throw new UnauthorizedException('Authentification requise');
    }
    if (user.role !== 'client') {
      throw new ForbiddenException('Accès réservé aux clients');
    }
  }

  private buildClientName(user: AuthUser): string | null {
    const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
    return name.length > 0 ? name : null;
  }

  // -----------------------------------------------------------
  // 📋 Liste des contacts du client connecté
  // -----------------------------------------------------------
  async listContacts(user: AuthUser | null): Promise<{ contacts: ClientContactWithEntreprise[] }> {
    this.ensureClient(user);
    const admin = this.supabaseService.getAdminClient();

    const { data, error } = await admin
      .from('client_contacts')
      .select('id, created_at, entreprise:entreprise_id(*)')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .returns<ClientContactWithEntreprise[]>();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { contacts: data ?? [] };
  }

  // -----------------------------------------------------------
  // ➕ Ajout d'un contact
  // -----------------------------------------------------------
  async addContact(
    dto: CreateClientContactDto,
    user: AuthUser | null,
  ): Promise<{ message: string } | { contact: ClientContactWithEntreprise | null }> {
    this.ensureClient(user);

    if (!dto?.entreprise_id) {
      throw new BadRequestException('entreprise_id requis');
    }

    const admin = this.supabaseService.getAdminClient();

    const { data: existing } = await admin
      .from('client_contacts')
      .select('id')
      .eq('client_id', user.id)
      .eq('entreprise_id', dto.entreprise_id)
      .maybeSingle<ClientContactRow>();

    if (existing) {
      return { message: '✅ Déjà dans vos contacts' };
    }

    const insert: ClientContactInsert = {
      client_id: user.id,
      entreprise_id: dto.entreprise_id,
    };

    const { data, error } = await admin
      .from('client_contacts')
      .insert(insert)
      .select('id, client_id, entreprise_id, created_at, entreprise:entreprise_id(*)')
      .single<ClientContactWithEntreprise>();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (data?.entreprise) {
      await this.notifyEntrepriseBookmarked(data.entreprise, user);
    }

    return { contact: data ?? null };
  }

  // -----------------------------------------------------------
  // ❌ Suppression d'un contact
  // -----------------------------------------------------------
  async deleteContact(id: number, user: AuthUser | null): Promise<{ success: true }> {
    this.ensureClient(user);

    const admin = this.supabaseService.getAdminClient();
    const { error, count } = await admin
      .from('client_contacts')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('client_id', user.id);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if ((count ?? 0) === 0) {
      throw new NotFoundException('Contact introuvable');
    }

    return { success: true };
  }

  private async notifyEntrepriseBookmarked(entreprise: EntrepriseDTO, user: AuthUser): Promise<void> {
    const clientName = this.buildClientName(user) ?? user.email ?? null;

    await this.mailerNotifications.companyBookmarked(
      {
        id: entreprise.id,
        nom: entreprise.nom ?? null,
        prenom: entreprise.prenom ?? null,
        email: entreprise.email ?? null,
        telephone: entreprise.telephone ?? null,
        slug: entreprise.slug ?? null,
      },
      {
        id: user.id,
        name: clientName,
        email: user.email ?? null,
      },
    );
  }
}
