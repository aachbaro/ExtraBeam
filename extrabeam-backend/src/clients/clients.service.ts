// src/clients/clients.service.ts
// -------------------------------------------------------------
// Service : Clients (entreprises)
// -------------------------------------------------------------
//
// 📌 Description :
//   - Gestion des relations entreprise ↔ clients via `client_contacts`
//   - Portage de la logique historique (attach/detach/list)
//
// 📍 Endpoints :
//   - GET    /api/clients
//   - POST   /api/clients/attach
//   - DELETE /api/clients/:id
//
// 🔒 Règles d’accès :
//   - Owner/admin entreprise uniquement (JwtAuthGuard)
//
// -------------------------------------------------------------

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { AccessService } from '../common/auth/access.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { AttachClientDto } from './dto/attach-client.dto';
import type { AuthUser } from '../common/auth/auth.types';
import type { Insert, Table } from '../types/aliases';

type ClientContactRow = Table<'client_contacts'>;
type ClientContactInsert = Insert<'client_contacts'>;
type ClientRow = Table<'clients'>;
type EntrepriseRow = Table<'entreprise'>;

export type ClientContactWithRelations = ClientContactRow & {
  client: ClientRow | null;
  entreprise: EntrepriseRow | null;
};

@Injectable()
export class ClientsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly accessService: AccessService,
  ) {}

  private ensureOwner(user: AuthUser | null): asserts user is AuthUser {
    if (!user) {
      throw new BadRequestException('Authentification requise');
    }
    if (!['freelance', 'entreprise', 'admin'].includes(user.role ?? '')) {
      throw new ForbiddenException('Accès réservé aux entreprises');
    }
  }

  private async resolveEntreprise(
    user: AuthUser,
    ref: string | number | null | undefined,
  ): Promise<EntrepriseRow> {
    const resolvedRef = this.accessService.resolveEntrepriseRef(user, ref);
    if (!resolvedRef) {
      throw new BadRequestException('Référence entreprise manquante');
    }
    const entreprise = await this.accessService.findEntreprise(resolvedRef);
    if (!this.accessService.canAccessEntreprise(user, entreprise)) {
      throw new ForbiddenException('Accès interdit');
    }
    return entreprise;
  }

  /** 👥 Liste les clients associés à une entreprise. */
  async listClients(
    entrepriseRef: string,
    user: AuthUser | null,
  ): Promise<{ contacts: ClientContactWithRelations[] }> {
    this.ensureOwner(user);
    const entreprise = await this.resolveEntreprise(user, entrepriseRef);

    const admin = this.supabaseService.getAdminClient();
    const { data, error } = await admin
      .from('client_contacts')
      .select(
        'id, created_at, client:client_id(*), entreprise:entreprise_id(*)',
      )
      .eq('entreprise_id', entreprise.id)
      .order('created_at', { ascending: false })
      .returns<ClientContactWithRelations[]>();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { contacts: data ?? [] };
  }

  /** 🔗 Attache un client à une entreprise. */
  async attachClient(
    entrepriseRef: string,
    dto: AttachClientDto,
    user: AuthUser | null,
  ): Promise<{ attached: true }> {
    this.ensureOwner(user);
    if (!dto?.client_id) {
      throw new BadRequestException('client_id requis');
    }
    const entreprise = await this.resolveEntreprise(user, entrepriseRef);

    const admin = this.supabaseService.getAdminClient();

    const { data: existing } = await admin
      .from('client_contacts')
      .select('id')
      .eq('entreprise_id', entreprise.id)
      .eq('client_id', dto.client_id)
      .returns<ClientContactRow[]>()
      .maybeSingle();

    if (existing) {
      return { attached: true };
    }

    const insert: ClientContactInsert = {
      entreprise_id: entreprise.id,
      client_id: dto.client_id,
    };
    const { error } = await admin.from('client_contacts').insert(insert);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { attached: true };
  }

  /** ❌ Détache un client d'une entreprise. */
  async detachClient(
    entrepriseRef: string,
    clientId: ClientRow['id'],
    user: AuthUser | null,
  ): Promise<{ detached: true }> {
    this.ensureOwner(user);
    const entreprise = await this.resolveEntreprise(user, entrepriseRef);

    const admin = this.supabaseService.getAdminClient();
    const { error, count } = await admin
      .from('client_contacts')
      .delete({ count: 'exact' })
      .eq('entreprise_id', entreprise.id)
      .eq('client_id', clientId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if ((count ?? 0) === 0) {
      throw new NotFoundException('Lien client introuvable');
    }

    return { detached: true };
  }
}
