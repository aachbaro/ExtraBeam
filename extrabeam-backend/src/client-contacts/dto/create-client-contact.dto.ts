// src/client-contacts/dto/create-client-contact.dto.ts
// -------------------------------------------------------------
// DTO : Ajout d'un contact client
// -------------------------------------------------------------

import type { TablesInsert } from '../../common/types/database';

export type CreateClientContactDto = Pick<TablesInsert<'client_contacts'>, 'entreprise_id'>;
