// src/missions/dto/mission-update.dto.ts
// -------------------------------------------------------------
// DTO : Mise à jour d’une mission
// -------------------------------------------------------------
//
// 📌 Description :
//   - Définit la charge utile pour la modification d’une mission existante
//   - Gère la mise à jour des slots associés
//
// 📍 Endpoints concernés :
//   - PUT /api/missions/:id
//
// 🔒 Règles d’accès :
//   - Authentification requise (JwtAuthGuard)
//   - Vérification des droits via AccessService
//
// ⚙️ Stack :
//   - TypeScript + class-validator + class-transformer
//   - Typage basé sur Supabase (`src/types/database.ts`)
//
// -------------------------------------------------------------

import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import type { Enum, Update } from '../../types/aliases';
import { MissionSlotDto } from './mission-create.dto';

// -------------------------------------------------------------
// 💾 Typages dérivés
// -------------------------------------------------------------
type MissionUpdate = Update<'missions'>;
type MissionStatus = Enum<'mission_status'>;
type MissionMode = Enum<'mission_mode'>;

// -------------------------------------------------------------
// 🧩 Interface : Charge utile brute
// -------------------------------------------------------------
export interface MissionUpdatePayload extends MissionUpdate {
  slots?: MissionSlotDto[] | null;
}

// -------------------------------------------------------------
// 🚀 DTO principal : MissionUpdateDto
// -------------------------------------------------------------
export class MissionUpdateDto implements MissionUpdatePayload {
  @IsOptional()
  @IsString()
  client_id?: MissionUpdate['client_id'];

  @IsOptional()
  @IsString()
  contact_email?: MissionUpdate['contact_email'];

  @IsOptional()
  @IsString()
  contact_name?: MissionUpdate['contact_name'];

  @IsOptional()
  @IsString()
  contact_phone?: MissionUpdate['contact_phone'];

  @IsOptional()
  @IsString()
  created_at?: MissionUpdate['created_at'];

  @IsOptional()
  @IsString()
  devis_url?: MissionUpdate['devis_url'];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  entreprise_id?: MissionUpdate['entreprise_id'];

  @IsOptional()
  @IsString()
  etablissement?: MissionUpdate['etablissement'];

  @IsOptional()
  @IsString()
  etablissement_adresse_ligne1?: MissionUpdate['etablissement_adresse_ligne1'];

  @IsOptional()
  @IsString()
  etablissement_adresse_ligne2?: MissionUpdate['etablissement_adresse_ligne2'];

  @IsOptional()
  @IsString()
  etablissement_code_postal?: MissionUpdate['etablissement_code_postal'];

  @IsOptional()
  @IsString()
  etablissement_pays?: MissionUpdate['etablissement_pays'];

  @IsOptional()
  @IsString()
  etablissement_ville?: MissionUpdate['etablissement_ville'];

  @IsOptional()
  @IsString()
  freelance_id?: MissionUpdate['freelance_id'];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id?: MissionUpdate['id'];

  @IsOptional()
  @IsString()
  instructions?: MissionUpdate['instructions'];

  @IsOptional()
  // ⚠️ Adapter les valeurs à ton enum réel Supabase (ex: 'freelance' | 'salarié')
  @IsEnum(['freelance', 'salarié'] satisfies MissionMode[])
  mode?: MissionUpdate['mode'];

  @IsOptional()
  @IsEnum([
    'proposed',
    'validated',
    'pending_payment',
    'paid',
    'completed',
    'refused',
    'realized',
  ] satisfies MissionStatus[])
  status?: MissionUpdate['status'];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MissionSlotDto)
  @IsArray()
  slots?: MissionUpdatePayload['slots'];
}
