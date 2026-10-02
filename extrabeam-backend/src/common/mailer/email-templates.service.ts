import { Injectable } from '@nestjs/common';

export type SlotDTO = { start: string; end: string; title?: string | null };
export type MissionDTO = {
  id: number;
  etablissement?: string | null;
  instructions?: string | null;
  mode?: string | null;
  status: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  slots?: SlotDTO[];
};
export type EntrepriseDTO = {
  id: number;
  nom?: string | null;
  prenom?: string | null;
  email?: string | null;
  telephone?: string | null;
  slug?: string | null;
};
export type ClientDTO = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

export type FactureDTO = {
  id: number;
  numero: string;
  montant_ttc?: number | null;
  montant_ht?: number | null;
  status: 'pending_payment' | 'paid' | 'canceled';
  payment_link?: string | null;
};

const fmtDate = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

const slotsBlock = (slots?: SlotDTO[]) =>
  (slots ?? [])
    .map(
      (s) =>
        `<li>📅 ${fmtDate(s.start)} → ${fmtDate(s.end)}${s.title ? ` — ${s.title}` : ''}</li>`,
    )
    .join('');

const wrap = (title: string, body: string) => `
  <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;padding:16px;">
    <h2 style="margin:0 0 12px 0;">${title}</h2>
    <div style="font-size:14px;line-height:1.6;color:#111;">
      ${body}
    </div>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5;" />
    <p style="font-size:12px;color:#666;">Envoyé par <b>Rivebelle</b> • Version beta</p>
  </div>
`;

@Injectable()
export class EmailTemplatesService {
  missionCreatedByClient(entreprise: EntrepriseDTO, mission: MissionDTO, client: ClientDTO) {
    const subject = `📢 Nouvelle mission proposée par ${client.name ?? 'un client'}`;
    const body = `
      <p>Bonjour ${entreprise.nom ?? ''},</p>
      <p>Un client vient de proposer une mission.</p>
      <ul>
        <li><b>Etablissement :</b> ${mission.etablissement ?? '—'}</li>
        <li><b>Contact :</b> ${mission.contact_name ?? '—'} (${mission.contact_email ?? '—'} / ${mission.contact_phone ?? '—'})</li>
        <li><b>Instructions :</b> ${mission.instructions ?? '—'}</li>
        <li><b>Statut :</b> ${mission.status}</li>
      </ul>
      <p><b>Créneaux :</b></p>
      <ul>${slotsBlock(mission.slots)}</ul>
    `;
    return { subject, html: wrap('Nouvelle mission', body) };
  }

  missionCreatedByVisitor(entreprise: EntrepriseDTO, mission: MissionDTO) {
    const subject = `📢 Demande entrante (visiteur) – ${mission.etablissement ?? 'Mission'}`;
    const body = `
      <p>Bonjour ${entreprise.nom ?? ''},</p>
      <p>Un visiteur sans compte a soumis une demande de mission :</p>
      <ul>
        <li><b>Contact :</b> ${mission.contact_name ?? '—'} (${mission.contact_email ?? '—'} / ${mission.contact_phone ?? '—'})</li>
        <li><b>Instructions :</b> ${mission.instructions ?? '—'}</li>
        <li><b>Statut :</b> ${mission.status}</li>
      </ul>
      <p><b>Créneaux :</b></p>
      <ul>${slotsBlock(mission.slots)}</ul>
    `;
    return { subject, html: wrap('Nouvelle demande entrante', body) };
  }

  companyBookmarked(entreprise: EntrepriseDTO, client: ClientDTO) {
    const subject = `⭐ ${client.name ?? 'Un client'} a ajouté votre entreprise en contact`;
    const body = `
      <p>Bonjour ${entreprise.nom ?? ''},</p>
      <p>${client.name ?? 'Un client'} vient d'ajouter votre entreprise à ses contacts.</p>
      <p>Vous pouvez envisager de le recontacter rapidement.</p>
    `;
    return { subject, html: wrap('Nouveau contact', body) };
  }

  billingStatusChangedForEntreprise(entreprise: EntrepriseDTO, facture: FactureDTO) {
    const subject = `💳 Facture ${facture.numero} → ${facture.status}`;
    const body = `
      <p>Bonjour ${entreprise.nom ?? ''},</p>
      <p>Le statut de la facture <b>${facture.numero}</b> a changé : <b>${facture.status}</b>.</p>
      ${
        facture.status === 'pending_payment' && facture.payment_link
          ? `<p>🧾 Lien de paiement : <a href="${facture.payment_link}">${facture.payment_link}</a></p>`
          : ''
      }
    `;
    return { subject, html: wrap('Mise à jour de facture', body) };
  }

  missionAckToClient(client: ClientDTO, mission: MissionDTO, entreprise: EntrepriseDTO) {
    const subject = `✅ Votre demande de mission a bien été envoyée`;
    const body = `
      <p>Bonjour ${client.name ?? ''},</p>
      <p>Votre demande de mission a été transmise à <b>${entreprise.nom ?? "l'entreprise"}</b>.</p>
      <p><b>Récapitulatif :</b></p>
      <ul>
        <li><b>Etablissement :</b> ${mission.etablissement ?? ''}</li>
        <li><b>Instructions :</b> ${mission.instructions ?? '—'}</li>
      </ul>
      <p><b>Créneaux :</b></p>
      <ul>${slotsBlock(mission.slots)}</ul>
    `;
    return { subject, html: wrap('Demande envoyée', body) };
  }

  missionStatusChangedToClient(
    clientEmail: string,
    mission: MissionDTO,
    entreprise: EntrepriseDTO,
  ) {
    const subject = `🔔 Mise à jour de votre mission – ${mission.status}`;
    const body = `
      <p>Bonjour,</p>
      <p>Votre mission avec <b>${entreprise.nom ?? "l'entreprise"}</b> est passée à l'état <b>${mission.status}</b>.</p>
      <p>Créneaux :</p>
      <ul>${slotsBlock(mission.slots)}</ul>
    `;
    return { subject, html: wrap('Mise à jour mission', body) };
  }

  missionSlotsRescheduledToClient(
    clientEmail: string,
    mission: MissionDTO,
    entreprise: EntrepriseDTO,
  ) {
    const subject = `🗓️ Créneaux mis à jour – ${entreprise.nom ?? 'Entreprise'}`;
    const body = `
      <p>Bonjour,</p>
      <p>Les créneaux de votre mission ont été mis à jour :</p>
      <ul>${slotsBlock(mission.slots)}</ul>
    `;
    return { subject, html: wrap('Créneaux mis à jour', body) };
  }

  invoiceCreatedToClient(clientEmail: string, facture: FactureDTO, entreprise: EntrepriseDTO) {
    const subject = `🧾 Nouvelle facture ${facture.numero}`;
    const body = `
      <p>Bonjour,</p>
      <p>Une facture a été émise par <b>${entreprise.nom ?? "l'entreprise"}</b>.</p>
      ${
        facture.payment_link
          ? `<p>Vous pouvez la régler ici : <a href="${facture.payment_link}">${facture.payment_link}</a></p>`
          : ''
      }
    `;
    return { subject, html: wrap('Facture créée', body) };
  }

  paymentLinkToClient(clientEmail: string, facture: FactureDTO, entreprise: EntrepriseDTO) {
    const subject = `💳 Paiement en ligne – Facture ${facture.numero}`;
    const body = `
      <p>Bonjour,</p>
      <p>Votre facture est prête au paiement.</p>
      ${
        facture.payment_link
          ? `<p>➡️ <a href="${facture.payment_link}">Payer la facture ${facture.numero}</a></p>`
          : '<p>(Lien de paiement indisponible)</p>'
      }
    `;
    return { subject, html: wrap('Lien de paiement', body) };
  }

  paymentSucceededToClient(clientEmail: string, facture: FactureDTO, entreprise: EntrepriseDTO) {
    const subject = `✅ Paiement confirmé – Facture ${facture.numero}`;
    const body = `
      <p>Bonjour,</p>
      <p>Nous confirmons la réception du paiement pour la facture <b>${facture.numero}</b>.</p>
      <p>Merci pour votre confiance.</p>
    `;
    return { subject, html: wrap('Paiement confirmé', body) };
  }

  paymentFailedToClient(clientEmail: string, facture: FactureDTO, entreprise: EntrepriseDTO) {
    const subject = `⚠️ Paiement échoué – Facture ${facture.numero}`;
    const body = `
      <p>Bonjour,</p>
      <p>Le paiement de votre facture <b>${facture.numero}</b> a échoué. Vous pouvez réessayer via le lien ci-dessous :</p>
      ${
        facture.payment_link
          ? `<p><a href="${facture.payment_link}">Réessayer le paiement</a></p>`
          : ''
      }
    `;
    return { subject, html: wrap('Paiement échoué', body) };
  }
}
