// src/mission-templates/dto/create-template.dto.ts
// -------------------------------------------------------------
// DTO : Création d'un template de mission
// -------------------------------------------------------------
//
// 📌 Description :
//   - Charge utile acceptée par POST /api/clients/templates
//   - Typage basé sur Supabase, avec validation stricte des champs
//
// 🧩 Règles :
//   - `nom` et `etablissement` sont requis
//   - Le `client_id` est injecté côté service (jamais issu du payload)
// -------------------------------------------------------------

import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

import type { Enum, Insert } from '../../types/aliases';

// -------------------------------------------------------------
// 💾 Alias de typage
// -------------------------------------------------------------
type TemplateInsert = Insert<'mission_templates'>;
type MissionMode = Enum<'mission_mode'>;

// -------------------------------------------------------------
// 🚀 DTO principal : CreateTemplateDto
// -------------------------------------------------------------
export class CreateTemplateDto implements Omit<TemplateInsert, 'client_id' | 'id'> {
  // 🏷️ Nom du template (obligatoire)
  @IsString()
  nom!: TemplateInsert['nom'];

  // 🏢 Établissement (obligatoire)
  @IsString()
  etablissement!: TemplateInsert['etablissement'];

  // 📞 Contacts
  @IsOptional()
  @IsString()
  contact_name?: TemplateInsert['contact_name'];

  @IsOptional()
  @IsEmail()
  contact_email?: TemplateInsert['contact_email'];

  @IsOptional()
  @IsString()
  contact_phone?: TemplateInsert['contact_phone'];

  // 📝 Détails supplémentaires
  @IsOptional()
  @IsString()
  instructions?: TemplateInsert['instructions'];

  // 🗺️ Adresse de l'établissement
  @IsOptional()
  @IsString()
  etablissement_adresse_ligne1?: TemplateInsert['etablissement_adresse_ligne1'];

  @IsOptional()
  @IsString()
  etablissement_adresse_ligne2?: TemplateInsert['etablissement_adresse_ligne2'];

  @IsOptional()
  @IsString()
  etablissement_code_postal?: TemplateInsert['etablissement_code_postal'];

  @IsOptional()
  @IsString()
  etablissement_ville?: TemplateInsert['etablissement_ville'];

  @IsOptional()
  @IsString()
  etablissement_pays?: TemplateInsert['etablissement_pays'];

  // ⚙️ Mode de mission (optionnel)
  @IsOptional()
  @IsEnum(['freelance', 'salarié'] satisfies MissionMode[])
  mode?: TemplateInsert['mode'];

  // 🕒 Date de création (optionnel pour compatibilité historique)
  @IsOptional()
  @IsString()
  created_at?: TemplateInsert['created_at'];
}
