// src/mission-templates/dto/update-template.dto.ts
// -------------------------------------------------------------
// DTO : Mise à jour d'un template de mission
// -------------------------------------------------------------
//
// 📌 Description :
//   - Payload accepté par PUT /api/clients/templates/:id
//   - Tous les champs sont optionnels (mise à jour partielle)
// -------------------------------------------------------------

import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

import type { Enum, Update } from '../../types/aliases';

// -------------------------------------------------------------
// 💾 Alias de typage
// -------------------------------------------------------------
type TemplateUpdate = Update<'mission_templates'>;
type MissionMode = Enum<'mission_mode'>;

// -------------------------------------------------------------
// 🚀 DTO principal : UpdateTemplateDto
// -------------------------------------------------------------
export class UpdateTemplateDto implements Omit<TemplateUpdate, 'client_id' | 'id'> {
  @IsOptional()
  @IsString()
  nom?: TemplateUpdate['nom'];

  @IsOptional()
  @IsString()
  etablissement?: TemplateUpdate['etablissement'];

  // 📞 Contacts
  @IsOptional()
  @IsString()
  contact_name?: TemplateUpdate['contact_name'];

  @IsOptional()
  @IsEmail()
  contact_email?: TemplateUpdate['contact_email'];

  @IsOptional()
  @IsString()
  contact_phone?: TemplateUpdate['contact_phone'];

  // 📝 Détails supplémentaires
  @IsOptional()
  @IsString()
  instructions?: TemplateUpdate['instructions'];

  // 🗺️ Adresse de l'établissement
  @IsOptional()
  @IsString()
  etablissement_adresse_ligne1?: TemplateUpdate['etablissement_adresse_ligne1'];

  @IsOptional()
  @IsString()
  etablissement_adresse_ligne2?: TemplateUpdate['etablissement_adresse_ligne2'];

  @IsOptional()
  @IsString()
  etablissement_code_postal?: TemplateUpdate['etablissement_code_postal'];

  @IsOptional()
  @IsString()
  etablissement_ville?: TemplateUpdate['etablissement_ville'];

  @IsOptional()
  @IsString()
  etablissement_pays?: TemplateUpdate['etablissement_pays'];

  // ⚙️ Mode de mission (optionnel)
  @IsOptional()
  @IsEnum(['freelance', 'salarié'] satisfies MissionMode[])
  mode?: TemplateUpdate['mode'];

  @IsOptional()
  @IsString()
  created_at?: TemplateUpdate['created_at'];
}
