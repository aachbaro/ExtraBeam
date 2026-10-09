import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { useUserContext } from '../context/UserContext';
import { fetchProfileOverview, updateProfile } from '../api';
import { JOBS, STATES, recruitmentApi, rememberHiringReturn, durationLabel, type HiringRequest, type Offer, type BriefProfile } from '../recruitmentApi';

type Action = (path: string, body: unknown) => Promise<void>;

function Conversation({ req, offer, token }: { req: HiringRequest; offer: Offer; token: string }) {
  const [messages, setMessages] = useState<{ id: number; author: BriefProfile; text: string; created_at: string }[]>([]);
  const [text, setText] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const path = `requests/${req.id}/offers/${offer.id}/messages/`;
  useEffect(() => {
    let active = true;
    const load = () => recruitmentApi<typeof messages>(path, token).then(value => { if (active) setMessages(value); }).catch(e => { if (active) setError(e.message); });
    void load(); const timer = window.setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [path, token]);
  async function send(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await recruitmentApi(path, token, 'POST', { text }); setText(''); setMessages(await recruitmentApi(path, token)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const closed = req.status === 'canceled' || ['closed', 'declined', 'rejected'].includes(offer.state);
  return <div className="mt-4 border-t border-eb-layout pt-4">
    <h3 className="font-semibold">Conversation privée</h3><p className="text-xs text-eb-secondary">Entre {req.client.display_name} et {offer.extra.display_name}.</p>
    <div className="my-3 max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
      {!messages.length && <p className="text-sm text-eb-muted">Aucun message pour le moment.</p>}
      {messages.map(msg => <div key={msg.id} className="rounded-lg bg-eb-page p-3 text-sm"><p className="text-xs text-eb-secondary">{msg.author.display_name} · {new Date(msg.created_at).toLocaleString('fr-FR')}</p><p className="whitespace-pre-wrap break-words">{msg.text}</p></div>)}
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!closed && <form onSubmit={send} className="flex gap-2"><input aria-label="Votre message" className="eb-input min-w-0 flex-1" value={text} onChange={e => setText(e.target.value)} maxLength={3000} required /><button className="eb-btn-primary" disabled={busy}>Envoyer</button></form>}
  </div>;
}

function Timesheet({ req, offer, act, busy }: { req: HiringRequest; offer: Offer; act: Action; busy: boolean }) {
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('0');
  useEffect(() => {
    const total = offer.timesheet ? Math.round(Number(offer.timesheet.hours) * 60) : null;
    setHours(total === null ? '' : String(Math.floor(total / 60)));
    setMinutes(total === null ? '0' : String(total % 60));
  }, [offer.timesheet?.hours]);
  const [note, setNote] = useState(''); const [rate, setRate] = useState(''); const [tax, setTax] = useState('0');
  const path = `requests/${req.id}/offers/${offer.id}/`;
  const sheet = offer.timesheet;
  const ended = new Date(req.ends_at).getTime() <= Date.now();
  const action = (name: string) => act(`${path}timesheet/`, { action: name, minutes: Number(hours) * 60 + Number(minutes), note });
  return <div className="mt-4 border-t border-eb-layout pt-4 space-y-3">
    <h3 className="font-semibold">Heures et facturation</h3>
    {sheet && <p className="text-sm">{durationLabel(sheet.hours)} · {({ submitted: 'À valider par le restaurateur', corrected: 'Correction à confirmer par l’extra', approved: 'Heures validées' } as Record<string, string>)[sheet.state]}{sheet.note && <span className="block text-eb-secondary">{sheet.note}</span>}</p>}
    {!ended && <p className="text-sm text-eb-secondary">Vous pourrez soumettre les heures après la fin du service.</p>}
    {ended && ((!req.is_client && (!sheet || sheet.state === 'submitted')) || (req.is_client && sheet?.state === 'submitted')) &&
      <form onSubmit={e => { e.preventDefault(); void action(req.is_client ? 'correct' : 'submit'); }} className="space-y-2">
        <div className="grid grid-cols-2 gap-3"><label className="block text-sm">Heures travaillées<input className="eb-input mt-1 w-full" type="number" step="1" min="0" max="168" required value={hours} onChange={e => setHours(e.target.value)} /></label>
        <label className="block text-sm">Minutes<input className="eb-input mt-1 w-full" type="number" step="1" min="0" max="59" required value={minutes} onChange={e => setMinutes(e.target.value)} /></label></div>
        <label className="block text-sm">{req.is_client ? 'Motif de la correction' : 'Commentaire (facultatif)'}<textarea className="eb-input mt-1 w-full" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} required={req.is_client} /></label>
        <button className="eb-btn-primary" disabled={busy}>{req.is_client ? 'Proposer une correction' : 'Soumettre mes heures'}</button>
      </form>}
    {req.is_client && sheet?.state === 'submitted' && <button className="eb-btn-primary" disabled={busy} onClick={() => void action('approve')}>Valider les {durationLabel(sheet.hours)}</button>}
    {!req.is_client && sheet?.state === 'corrected' && <div className="flex flex-wrap gap-2"><button className="eb-btn-primary" disabled={busy} onClick={() => void action('approve')}>Confirmer la correction</button><button className="eb-btn-ghost" disabled={busy} onClick={() => void action('reject_correction')}>Demander une révision</button></div>}
    {!req.is_client && sheet?.state === 'approved' && !sheet.invoice_id && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void act(`${path}invoice/`, { rate: rate || null, tax }); }}>
      {req.rate_kind === 'none' && <label className="block text-sm">Taux horaire HT convenu (€)<input className="eb-input ml-2 w-28" type="number" min=".01" step=".01" value={rate} onChange={e => setRate(e.target.value)} required /></label>}
      <label className="block text-sm">TVA (%)<input className="eb-input ml-2 w-28" type="number" min="0" max="100" step=".01" value={tax} onChange={e => setTax(e.target.value)} required /></label>
      <button className="eb-btn-primary" disabled={busy}>Préparer le brouillon de facture</button><p className="text-xs text-eb-secondary">Vérifiez ensuite votre identité, les mentions et les montants dans Factures, puis finalisez et envoyez explicitement.</p>
    </form>}
    {sheet?.invoice_id && <p className="text-sm">Facture préparée. {!req.is_client && <Link className="text-eb-primary underline" to={`/extras/${offer.extra.slug}?tab=factures`}>Ouvrir mes factures</Link>}</p>}
  </div>;
}

function BillingForm({ slug, token, refresh, guestRequestId }: { slug: string; token: string; refresh: () => Promise<void>; guestRequestId?: string }) {
  const [form, setForm] = useState({ legal_name: '', siren: '', address_line1: '', address_line2: '', postal_code: '', city: '', country: 'France', vat_number: '', billing_email: '' });
  const [error, setError] = useState(''); const [saved, setSaved] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void (guestRequestId ? recruitmentApi<Record<string, string>>(`requests/${guestRequestId}/guest/billing/`, token).then(profile => ({ profile })) : fetchProfileOverview(slug, token)).then(value => {
    if (active) setForm(current => Object.fromEntries(Object.keys(current).map(key => [key, value.profile[key as keyof typeof value.profile] || current[key as keyof typeof current]])) as typeof current);
  }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [slug, token, guestRequestId]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false);
    try { if (guestRequestId) await recruitmentApi(`requests/${guestRequestId}/guest/billing/`, token, 'PATCH', form); else await updateProfile(slug, form, token); setSaved(true); await refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const labels: Record<keyof typeof form, string> = { legal_name: 'Raison sociale', siren: 'SIREN (9 chiffres)', address_line1: 'Adresse de facturation', address_line2: 'Complément (facultatif)', postal_code: 'Code postal', city: 'Ville', country: 'Pays', vat_number: 'TVA intracommunautaire (si applicable)', billing_email: 'Email comptabilité (facultatif)' };
  return <details className="rounded-xl border border-eb-layout bg-[#fffdf7] p-5"><summary className="cursor-pointer font-semibold">Coordonnées de facturation réutilisables</summary><form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
    {(Object.keys(form) as (keyof typeof form)[]).map(key => <label key={key} className="text-sm">{labels[key]}<input className="eb-input mt-1 w-full" type={key === 'billing_email' ? 'email' : 'text'} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} required={!['address_line2', 'vat_number', 'billing_email'].includes(key)} pattern={key === 'siren' ? '[0-9]{9}' : undefined} maxLength={key === 'siren' ? 9 : 200} /></label>)}
    <p className="text-xs text-eb-secondary sm:col-span-2">L’identité et l’adresse sont nécessaires à la facture. Ces coordonnées servent à toutes vos missions. L’email du compte est utilisé si vous ne renseignez pas d’email comptabilité.</p>
    {error && <p role="alert">{error}</p>}{saved && <p role="status">Coordonnées enregistrées.</p>}
    <button className="eb-btn-primary" disabled={busy}>Enregistrer</button>
  </form></details>;
}

export default function RequestPage({ guestAccess }: { guestAccess?: { id: string; token: string } }) {
  const params = useParams(); const { user } = useUserContext();
  const id = guestAccess?.id || params.id;
  const token = guestAccess ? `guest:${guestAccess.token}` : user?.token;
  const [req, setReq] = useState<HiringRequest | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const load = useCallback(async () => { if (token && id) setReq(await recruitmentApi<HiringRequest>(`requests/${id}/`, token)); }, [id, token]);
  useEffect(() => { let active = true;
    const refresh = () => { if (active) void load().catch(e => { if (active) setError(e.message); }); };
    refresh(); const timer = window.setInterval(refresh, 15000); return () => { active = false; clearInterval(timer); };
  }, [load]);
  async function act(path: string, body: unknown) {
    if (!token) return; setBusy(true); setError('');
    try { await recruitmentApi(path, token, 'POST', body); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!token) return <main className="min-h-screen bg-eb-page"><div className="mx-auto max-w-3xl p-6"><Topbar warm /><p className="mt-8">Connectez-vous pour consulter cette demande.</p><Link to="/login" onClick={() => rememberHiringReturn(`/requests/${id}`)} className="eb-btn-primary mt-4 inline-block">Se connecter</Link></div></main>;
  return <main className="min-h-screen bg-eb-page"><div className="mx-auto max-w-4xl space-y-5 px-4 py-6"><Topbar warm />
    {!guestAccess && user && <Link className="text-sm text-eb-primary" to={user.role === 'client' ? '/restaurateur' : `/extras/${user.slug}?tab=missions`}>← Mon espace</Link>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
    {!req && !error && <p role="status">Chargement de la demande…</p>}
    {req && <>
      <section className="rounded-xl border border-eb-layout bg-[#fffdf7] p-5 space-y-2">
        <p className="text-sm text-eb-primary">{STATES[req.status]}</p><h1 className="text-2xl font-semibold">{req.establishment} · {req.job === 'other' ? req.custom_job : JOBS[req.job]}</h1>
        <p>{new Date(req.starts_at).toLocaleString('fr-FR')} → {new Date(req.ends_at).toLocaleString('fr-FR')}</p>
        <p>{req.address}</p>{req.dress_code && <p>Tenue : {req.dress_code}</p>}{req.notes && <p className="whitespace-pre-wrap">{req.notes}</p>}
        <p className="text-sm">{req.rate_kind === 'none' ? 'Tarif à convenir' : `${req.rate} € HT ${req.rate_kind === 'hourly' ? '/ heure' : 'au forfait'} par extra`}</p>
        <p className="text-sm">{req.remaining} place(s) restante(s) sur {req.quantity} · {req.interested_count} candidature(s) en attente</p>
        {req.next_wave_at && <p className="text-xs text-eb-secondary">Prochaine vague au plus tôt à {new Date(req.next_wave_at).toLocaleTimeString('fr-FR')}, si des candidats manquent.</p>}
        {!req.is_client && ['recruiting', 'exhausted'].includes(req.status) && req.offers.some(o => ['offered', 'interested', 'deferred'].includes(o.state)) && <p className="rounded-lg bg-eb-page p-3 text-sm">{req.compatible_after} extra(s) compatible(s) après vous, dont {req.available_after} avec une disponibilité déclarée. Les autres disponibilités restent inconnues.{req.own_availability === 'unavailable' && <span className="block text-red-700">Vous avez une indisponibilité ou une mission sur ce créneau.</span>}</p>}
        {req.is_client && ['recruiting', 'exhausted'].includes(req.status) && !req.offers.some(o => o.state === 'selected') && <button className="eb-btn-ghost" disabled={busy} onClick={() => void act(`requests/${req.id}/`, { action: 'cancel' })}>Annuler cette demande</button>}
      </section>
      {req.is_client && req.offers.some(o => o.state === 'selected') && <><p className="text-sm">{req.billing_complete ? 'Coordonnées de facturation complètes.' : 'Complétez votre identité de facturation pour que les extras puissent préparer leurs factures.'}</p><BillingForm slug={user?.slug || ''} token={token!} refresh={load} guestRequestId={guestAccess ? req.id : undefined} /></>}
      {req.offers.map(offer => <section key={offer.id} className="rounded-xl border border-eb-layout bg-[#fffdf7] p-5">
        <div className="flex flex-wrap justify-between gap-2"><Link className="font-semibold text-eb-primary" to={`/extras/${offer.extra.slug}`}>{offer.extra.display_name || offer.extra.slug}</Link><span className="text-sm">{STATES[offer.state]}</span></div>
        <p className="mt-1 text-xs text-eb-secondary">{offer.wave === 0 ? 'Profil destinataire de la demande' : offer.wave === 1 ? 'Contact ou ancien collaborateur du restaurant' : offer.wave === 2 ? `Contact ajouté au réseau de ${req.target.display_name}` : 'Extra ayant activé les propositions Rivebelle'}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!req.is_client && ['offered', 'interested'].includes(offer.state) && ['recruiting', 'exhausted'].includes(req.status) && <>
            {offer.state === 'offered' && <button className="eb-btn-primary" disabled={busy || req.own_availability === 'unavailable'} onClick={() => void act(`requests/${req.id}/offers/${offer.id}/action/`, { action: 'interested' })}>Je suis intéressé</button>}
            <button className="eb-btn-ghost" disabled={busy} onClick={() => void act(`requests/${req.id}/offers/${offer.id}/action/`, { action: 'deferred' })}>Non, sauf si personne d’autre accepte</button>
            <button className="eb-btn-ghost" disabled={busy} onClick={() => void act(`requests/${req.id}/offers/${offer.id}/action/`, { action: 'rejected' })}>Refuser</button>
          </>}
          {req.is_client && offer.state === 'interested' && <><button className="eb-btn-primary" disabled={busy} onClick={() => void act(`requests/${req.id}/offers/${offer.id}/action/`, { action: 'select' })}>Confirmer cet extra</button><button className="eb-btn-ghost" disabled={busy} onClick={() => void act(`requests/${req.id}/offers/${offer.id}/action/`, { action: 'decline' })}>Décliner</button></>}
          {offer.offered_at && <button className="eb-btn-ghost" onClick={() => setConversationId(conversationId === offer.id ? null : offer.id)} aria-expanded={conversationId === offer.id}>Conversation</button>}
        </div>
        {!req.is_client && offer.state === 'interested' && <p className="mt-2 text-sm text-eb-secondary">Votre intérêt est transmis. La mission sera confirmée lorsque le restaurateur vous sélectionnera.</p>}
        {!req.is_client && offer.state === 'deferred' && <p className="mt-2 text-sm text-eb-secondary">Vous avez passé votre tour. Si des places restent après la diffusion, Rivebelle vous proposera de revenir.</p>}
        {offer.state === 'selected' && <p className="mt-2 text-sm text-eb-primary">Mission confirmée. Retrouvez les détails ci-dessus et échangez dans la conversation privée.</p>}
        {offer.state === 'selected' && <Timesheet req={req} offer={offer} act={act} busy={busy} />}
        {conversationId === offer.id && <Conversation req={req} offer={offer} token={token!} />}
      </section>)}
    </>}
  </div></main>;
}
