import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { Facture, FreelancerProfile } from "../types";

function parseAmount(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function pushLine(lines: string[], value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (normalized) {
    lines.push(normalized);
  }
}

function pushLabelLine(lines: string[], label: string, value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (normalized) {
    lines.push(`${label} : ${normalized}`);
  }
}

function renderLines(
  doc: jsPDF,
  lines: string[],
  x: number,
  startY: number,
  maxWidth: number
): number {
  let y = startY;
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, maxWidth);
    doc.text(wrapped, x, y);
    y += wrapped.length * 5;
  }
  return y;
}

export function downloadFacturePdf(
  facture: Facture,
  profile: FreelancerProfile
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const amountHt = parseAmount(facture.montant_ht);
  const vatRate = parseAmount(facture.tva) ?? 0;
  const amountTtc = parseAmount(facture.montant_ttc);
  const vatAmount =
    amountHt === null ? null : Number((amountHt * vatRate) / 100);
  const quantityLabel = facture.hours?.trim() || "1";
  const unitPrice = parseAmount(facture.rate) ?? amountHt;
  const description =
    facture.description.trim() ||
    facture.mission_title?.trim() ||
    "Prestation de service";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("FACTURE", 105, 18, { align: "center" });

  doc.setDrawColor(220);
  doc.setFillColor(248, 248, 248);
  doc.rect(145, 24, 50, 28, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`N° ${facture.numero}`, 150, 32);
  doc.text(`Date : ${formatDate(facture.date_emission)}`, 150, 39);
  if (facture.date_echeance) {
    doc.text(`Échéance : ${formatDate(facture.date_echeance)}`, 150, 46);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Émetteur", 20, 56);
  doc.text("Client", 110, 56);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const sellerLines: string[] = [];
  pushLine(sellerLines, profile.display_name);
  pushLine(sellerLines, profile.address_line1);
  pushLine(sellerLines, profile.address_line2);
  pushLine(
    sellerLines,
    [profile.postal_code, profile.city].filter(Boolean).join(" ").trim()
  );
  pushLine(sellerLines, profile.country);
  pushLabelLine(sellerLines, "Statut", profile.legal_status);
  pushLabelLine(sellerLines, "SIRET", profile.siret);
  pushLabelLine(sellerLines, "TVA", profile.vat_number);
  pushLabelLine(sellerLines, "Tél", profile.phone);
  pushLabelLine(sellerLines, "Email", profile.email);

  const clientLines: string[] = [];
  pushLine(clientLines, facture.client_name);
  pushLine(clientLines, facture.client_address_ligne1);
  pushLine(clientLines, facture.client_address_ligne2);
  pushLine(
    clientLines,
    [facture.client_code_postal, facture.client_ville]
      .filter(Boolean)
      .join(" ")
      .trim()
  );
  pushLine(clientLines, facture.client_pays);
  pushLabelLine(clientLines, "SIREN", facture.client_siren);
  pushLabelLine(clientLines, "SIRET", facture.client_siret);
  pushLabelLine(clientLines, "TVA", facture.client_vat_number);
  pushLabelLine(clientLines, "Contact", facture.contact_name);
  pushLabelLine(clientLines, "Tél", facture.contact_phone);
  pushLabelLine(clientLines, "Email", facture.contact_email);

  const sellerEndY = renderLines(doc, sellerLines, 20, 63, 75);
  const clientEndY = renderLines(doc, clientLines, 110, 63, 75);
  const tableStartY = Math.max(sellerEndY, clientEndY) + 10;

  autoTable(doc, {
    startY: tableStartY,
    head: [["Description", "Qté", "PU HT", "Total HT"]],
    body: [[description, quantityLabel, formatMoney(unitPrice), formatMoney(amountHt)]],
    theme: "grid",
    headStyles: {
      fillColor: [28, 78, 128],
      textColor: 255,
      halign: "center",
    },
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 3,
      lineColor: [220, 220, 220],
    },
    columnStyles: {
      0: { cellWidth: 95 },
      1: { halign: "right", cellWidth: 20 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 30 },
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? tableStartY;
  const summaryY = finalY + 10;

  doc.setDrawColor(220);
  doc.setFillColor(248, 248, 248);
  doc.rect(120, summaryY, 75, 30, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Montant HT : ${formatMoney(amountHt)}`, 125, summaryY + 8);
  doc.text(`TVA (${vatRate.toFixed(2)} %) : ${formatMoney(vatAmount)}`, 125, summaryY + 15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Total TTC : ${formatMoney(amountTtc)}`, 125, summaryY + 24);

  const mentions: string[] = [];
  pushLine(mentions, facture.mention_tva || profile.vat_notice);
  pushLabelLine(mentions, "Date d'échéance", facture.date_echeance ? formatDate(facture.date_echeance) : "");
  pushLabelLine(
    mentions,
    "Conditions de paiement",
    facture.conditions_paiement || profile.payment_terms
  );
  pushLabelLine(mentions, "Escompte", facture.escompte);
  pushLabelLine(
    mentions,
    "Pénalités de retard",
    facture.penalites_retard || profile.late_penalties
  );
  pushLine(mentions, facture.indemnite_recouvrement);

  let mentionsY = summaryY + 40;
  if (mentions.length > 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(90);
    mentionsY = renderLines(doc, mentions, 20, mentionsY, 170) + 2;
    doc.setTextColor(0);
  }

  if (profile.iban || profile.bic) {
    doc.setDrawColor(220);
    doc.setFillColor(248, 248, 248);
    doc.rect(90, mentionsY + 4, 105, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Coordonnées bancaires", 95, mentionsY + 11);
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    if (profile.iban) {
      doc.text(`IBAN : ${profile.iban}`, 95, mentionsY + 17);
    }
    if (profile.bic) {
      doc.text(`BIC  : ${profile.bic}`, 95, mentionsY + 22);
    }
  }

  const namePart = profile.display_name
    ? profile.display_name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    : "";
  const filename = namePart
    ? `facture-${namePart}-${facture.numero}.pdf`
    : `facture-${facture.numero}.pdf`;
  doc.save(filename);
}
