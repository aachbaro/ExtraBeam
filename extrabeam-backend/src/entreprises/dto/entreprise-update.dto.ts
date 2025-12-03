import { IsNumber, IsOptional, IsString } from 'class-validator';

import type { Update } from '../../types/aliases';

type EntrepriseUpdate = Update<'entreprise'>;

// Cette classe valide la forme d’un payload conforme à Update<'entreprise'>
// sans chercher à implémenter l’interface générée
export class EntrepriseUpdateDto {
  @IsOptional()
  @IsString()
  adresse_ligne1?: EntrepriseUpdate['adresse_ligne1'];

  @IsOptional()
  @IsString()
  adresse_ligne2?: EntrepriseUpdate['adresse_ligne2'];

  @IsOptional()
  @IsString()
  bic?: EntrepriseUpdate['bic'];

  @IsOptional()
  @IsString()
  code_postal?: EntrepriseUpdate['code_postal'];

  @IsOptional()
  @IsString()
  conditions_paiement?: EntrepriseUpdate['conditions_paiement'];

  @IsOptional()
  @IsString()
  created_at?: EntrepriseUpdate['created_at'];

  @IsOptional()
  @IsString()
  devise?: EntrepriseUpdate['devise'];

  @IsOptional()
  @IsString()
  email?: EntrepriseUpdate['email'];

  @IsOptional()
  @IsString()
  iban?: EntrepriseUpdate['iban'];

  @IsOptional()
  @IsNumber()
  id?: EntrepriseUpdate['id'];

  @IsOptional()
  @IsString()
  mention_tva?: EntrepriseUpdate['mention_tva'];

  @IsOptional()
  @IsString()
  nom?: EntrepriseUpdate['nom'];

  @IsOptional()
  @IsString()
  pays?: EntrepriseUpdate['pays'];

  @IsOptional()
  @IsString()
  penalites_retard?: EntrepriseUpdate['penalites_retard'];

  @IsOptional()
  @IsString()
  prenom?: EntrepriseUpdate['prenom'];

  @IsOptional()
  @IsString()
  siret?: EntrepriseUpdate['siret'];

  @IsOptional()
  @IsString()
  slug?: EntrepriseUpdate['slug'];

  @IsOptional()
  @IsString()
  statut_juridique?: EntrepriseUpdate['statut_juridique'];

  @IsOptional()
  @IsString()
  stripe_account_id?: EntrepriseUpdate['stripe_account_id'];

  @IsOptional()
  @IsNumber()
  taux_horaire?: EntrepriseUpdate['taux_horaire'];

  @IsOptional()
  @IsString()
  telephone?: EntrepriseUpdate['telephone'];

  @IsOptional()
  @IsString()
  tva_intracom?: EntrepriseUpdate['tva_intracom'];

  @IsOptional()
  @IsString()
  updated_at?: EntrepriseUpdate['updated_at'];

  @IsOptional()
  @IsString()
  user_id?: EntrepriseUpdate['user_id'];

  @IsOptional()
  @IsString()
  ville?: EntrepriseUpdate['ville'];
}
