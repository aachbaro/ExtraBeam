import { useId, useRef, useState } from "react";
import { lookupCompany, type CompanyIdentity } from "../../api";

export default function CompanyLookup({ token, initialSiret = "", onSelect }: {
  token: string;
  initialSiret?: string;
  onSelect: (company: CompanyIdentity) => void;
}) {
  const id = useId();
  const [siret, setSiret] = useState(initialSiret);
  const [company, setCompany] = useState<CompanyIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(false);
  const version = useRef(0);
  async function search() {
    const query = siret.replace(/\s/g, "");
    setCompany(null);
    setSelected(false);
    if (!/^[0-9]{14}$/.test(query)) {
      setError("Saisissez un SIRET de 14 chiffres.");
      return;
    }
    const requestVersion = ++version.current;
    setBusy(true);
    setError("");
    try {
      const result = await lookupCompany(query, token);
      if (requestVersion === version.current) setCompany(result);
    } catch (failure) {
      if (requestVersion === version.current) setError(failure instanceof Error ? failure.message : "La recherche a échoué. Vous pouvez remplir les champs manuellement.");
    } finally {
      if (requestVersion === version.current) setBusy(false);
    }
  }
  return <section className="rounded-xl border border-[#ead9a5] bg-[#fff9e8] p-4 space-y-3">
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">Trouver l’entreprise à facturer</label>
      <p className="mt-1 text-xs text-eb-muted">Renseignez son SIRET pour retrouver ses coordonnées publiques.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <input id={id} className="eb-input flex-1 min-w-0" inputMode="numeric" autoComplete="off"
        placeholder="SIRET · 14 chiffres" value={siret} disabled={busy}
        onChange={(event) => { version.current++; setSiret(event.target.value); setCompany(null); setError(""); setSelected(false); }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (!busy) void search(); } }} />
      <button type="button" className="rounded-lg border border-[#e5c974] bg-[#f8e5a5] px-4 py-2 text-sm font-medium disabled:opacity-50"
        disabled={busy} onClick={() => void search()}>{busy ? "Recherche…" : "Rechercher"}</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {company && <div className="rounded-lg border border-[#ead9a5] bg-white p-3 space-y-2" aria-live="polite">
      <p className="font-semibold">{company.legal_name}</p>
      <p className="text-sm">SIREN : {company.siren} · SIRET : {company.siret}</p>
      <p className="text-sm">{company.address_line1}{company.address_line2 && <><br />{company.address_line2}</>}<br />{company.postal_code} {company.city}</p>
      <p className={`text-sm ${company.status === "closed" ? "text-red-700" : "text-eb-muted"}`}>
        {company.status === "active" ? "Établissement actif" : company.status === "closed" ? "Établissement fermé : vérifiez les coordonnées avant de facturer." : "Statut non renseigné"}
      </p>
      <button type="button" className="rounded-lg bg-[#f8e5a5] px-4 py-2 text-sm font-medium disabled:opacity-60"
        disabled={selected} onClick={() => { onSelect(company); setSelected(true); }}>{selected ? "Coordonnées renseignées" : "Utiliser cette entreprise"}</button>
      <p className="text-xs text-eb-muted">Données publiques SIRENE · Annuaire des entreprises. Vérifiez les informations avant d’enregistrer.</p>
    </div>}
    <p className="text-xs text-eb-muted">La saisie manuelle reste possible. Le contact et la TVA sont à compléter séparément.</p>
  </section>;
}
