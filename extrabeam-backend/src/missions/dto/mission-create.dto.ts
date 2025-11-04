// src/missions/dto/mission-create.dto.ts
// -------------------------------------------------------------
// DTO : Création d’une mission
// -------------------------------------------------------------
//
// 📌 Description :
//   - Définit la charge utile pour la création d’une mission
//   - Compatible avec les créations publiques (visiteurs non connectés)
//     et privées (entreprises / freelances connectés)
//
// 📍 Endpoints concernés :
//   - POST /api/missions
//   - POST /api/missions/public
//
// ⚙️ Stack :
//   - TypeScript + class-validator + class-transformer
//   - Typage basé sur Supabase (`src/types/database.ts`)
//
// 🧩 Validation
//   - Champs minimum requis : etablissement, contact_email, contact_phone
//   - Tous les autres champs sont optionnels pour compatibilité publique
//
// -------------------------------------------------------------

import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsEmail,
  ValidateNested,
} from 'class-validator';

import type { Enum, Insert } from '../../types/aliases';

// -------------------------------------------------------------
// 💾 Typages dérivés
// -------------------------------------------------------------
type MissionInsert = Insert<'missions'>;
type SlotInsert = Insert<'slots'>;
type MissionStatus = Enum<'mission_status'>;
type MissionMode = Enum<'mission_mode'>;

// -------------------------------------------------------------
// 🎯 Sous-DTO : Slot de mission
// -------------------------------------------------------------
export class MissionSlotDto
  implements Pick<SlotInsert, 'start' | 'end' | 'title'>
{
  @IsString()
  start!: NonNullable<SlotInsert['start']>;

  @IsString()
  end!: NonNullable<SlotInsert['end']>;

  @IsOptional()
  @IsString()
  title?: SlotInsert['title'];
}

// -------------------------------------------------------------
// 🧩 Interface : Charge utile brute
// -------------------------------------------------------------
export interface MissionCreatePayload extends MissionInsert {
  entrepriseRef?: string | null;
  slots?: MissionSlotDto[];
}

// -------------------------------------------------------------
// 🚀 DTO principal : MissionCreateDto
// -------------------------------------------------------------
export class MissionCreateDto implements MissionCreatePayload {
  // 🔗 Référence entreprise (slug ou ID)
  @IsOptional()
  @IsString()
  entrepriseRef?: MissionCreatePayload['entrepriseRef'];

  // 🔑 Clés étrangères (souvent null côté public)
  @IsOptional()
  @IsString()
  client_id?: MissionInsert['client_id'];

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  entreprise_id?: MissionInsert['entreprise_id'];

  @IsOptional()
  @IsString()
  freelance_id?: MissionInsert['freelance_id'];

  // 📞 Contact principal
  @IsEmail()
  contact_email!: MissionInsert['contact_email'];

  @IsOptional()
  @IsString()
  contact_name?: MissionInsert['contact_name'];

  @IsString()
  contact_phone!: MissionInsert['contact_phone'];

  // 🏢 Établissement
  @IsString()
  etablissement!: MissionInsert['etablissement'];

  @IsOptional()
  @IsString()
  etablissement_adresse_ligne1?: MissionInsert['etablissement_adresse_ligne1'];

  @IsOptional()
  @IsString()
  etablissement_adresse_ligne2?: MissionInsert['etablissement_adresse_ligne2'];

  @IsOptional()
  @IsString()
  etablissement_code_postal?: MissionInsert['etablissement_code_postal'];

  @IsOptional()
  @IsString()
  etablissement_ville?: MissionInsert['etablissement_ville'];

  @IsOptional()
  @IsString()
  etablissement_pays?: MissionInsert['etablissement_pays'];

  // 📝 Détails supplémentaires
  @IsOptional()
  @IsString()
  instructions?: MissionInsert['instructions'];

  @IsOptional()
  @IsString()
  devis_url?: MissionInsert['devis_url'];

  @IsOptional()
  @IsString()
  created_at?: MissionInsert['created_at'];

  // ⚙️ Enumérations
  @IsOptional()
  @IsEnum(['freelance', 'salarié'] satisfies MissionMode[])
  mode?: MissionInsert['mode'];

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
  status?: MissionInsert['status'];

  // 📅 Créneaux horaires
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MissionSlotDto)
  @IsArray()
  slots?: MissionCreatePayload['slots'];
}
