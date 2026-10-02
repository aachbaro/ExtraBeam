import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUserContext } from '../../context/UserContext';
import { JOBS, recruitmentApi, rememberHiringReturn, type HiringRequest } from '../../recruitmentApi';
import type { Unavailability } from '../../types';
import SoftReveal from '../SoftReveal';

interface Props { slug: string; extraName?: string; hourlyRate?: string | null; unavailabilities?: Unavailability[];
  externalSlot?: { date: string; start: string; end: string } | null }
interface Form { establishment: string; address: string; starts_at: string; ends_at: string; job: string; custom_job: string; dress_code: string;
  quantity: number; cascade: boolean; rate_kind: string; rate: string; notes: string }
const empty: Form = { establishment: '', address: '', starts_at: '', ends_at: '', job: 'service', custom_job: '', dress_code: '',
  quantity: 1, cascade: true, rate_kind: 'none', rate: '', notes: '' };

export default function ProposalForm({ slug, extraName, hourlyRate, externalSlot }: Props) {
  const { user } = useUserContext();
  const navigate = useNavigate();
  const revealId = useId();
  const storageKey = `rivebelle-proposal-${slug}`;
  const [form, setForm] = useState<Form>(() => {
    try { const draft = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); return { ...empty, rate: hourlyRate || '', ...draft }; }
    catch { return { ...empty, rate: hourlyRate || '' }; }
  });
  const [expanded, setExpanded] = useState(() => !!sessionStorage.getItem(storageKey));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState(false);
  useEffect(() => {
    if (externalSlot) {
      setExpanded(true);
      const endDay = new Date(`${externalSlot.date}T12:00:00`);
      if (externalSlot.end <= externalSlot.start) endDay.setDate(endDay.getDate() + 1);
      const date = `${endDay.getFullYear()}-${String(endDay.getMonth() + 1).padStart(2, '0')}-${String(endDay.getDate()).padStart(2, '0')}`;
      setForm(value => ({ ...value, starts_at: `${externalSlot.date}T${externalSlot.start}`, ends_at: `${date}T${externalSlot.end}` }));
    }
  }, [externalSlot]);
  const change = <K extends keyof Form>(key: K, value: Form[K]) => setForm(current => ({ ...current, [key]: value }));
  const preserve = () => { sessionStorage.setItem(storageKey, JSON.stringify(form)); rememberHiringReturn(`/extras/${slug}`); };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const req = await recruitmentApi<HiringRequest & { pending_email?: boolean }>(user?.token ? 'requests/' : 'guest/requests/', user?.token || '', 'POST', { ...form, email, target_slug: slug,
        starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString(),
        rate: form.rate_kind === 'none' ? null : form.rate });
      sessionStorage.removeItem(storageKey);
      if (req.pending_email) { setPendingEmail(true); return; }
      navigate(`/requests/${req.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Envoi impossible.'); }
    finally { setBusy(false); }
  }
  const field = (key: 'establishment' | 'address' | 'starts_at' | 'ends_at' | 'dress_code' | 'custom_job' | 'rate', label: string, type = 'text', required = false) =>
    <label className="block text-sm">{label}<input className="eb-input mt-1 w-full" type={type} value={form[key]} onChange={e => change(key, e.target.value)} required={required}
      maxLength={key === 'address' ? 500 : 200} min={type === 'number' ? '.01' : undefined} step={type === 'number' ? '.01' : undefined} /></label>;
  return <section className="rounded-[24px] border border-[#dec99c] bg-[#fffaf0] p-5 shadow-[0_12px_35px_-20px_#9a702e] sm:p-7">
    <p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#86652f]">Un coup de main pour votre prochain service</p>
    <button className="min-h-[56px] w-full rounded-2xl bg-[#f3c64c] px-5 py-3 text-base font-semibold text-[#352b1d] transition hover:bg-[#edba32] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#86652f]" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={revealId}>Proposer une mission à {extraName || 'cet extra'}</button>
    <SoftReveal open={expanded} id={revealId}>
    {pendingEmail ? <div role="status" className="mt-5 rounded-2xl bg-white p-5"><h2 className="font-semibold">Un dernier clic dans votre boîte mail</h2><p className="mt-2 text-sm">Confirmez votre adresse pour envoyer la demande. Vous recevrez ensuite les candidatures et votre lien personnel de suivi à {email}.</p></div> : <form onSubmit={submit} className="mt-5 space-y-4">
      <p className="text-sm text-eb-secondary">La proposition arrive d’abord à {extraName || 'cet extra'}. Vous choisirez ensuite les candidats intéressés.</p>
      {field('establishment', 'Établissement', 'text', true)}{field('address', 'Adresse complète du service', 'text', true)}
      <div className="grid gap-3 sm:grid-cols-2">{field('starts_at', 'Début du service', 'datetime-local', true)}{field('ends_at', 'Fin du service', 'datetime-local', true)}</div>
      <label className="block text-sm">Poste<select className="eb-input mt-1 w-full" value={form.job} onChange={e => change('job', e.target.value)}>{Object.entries(JOBS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      {form.job === 'other' && field('custom_job', 'Précisez le poste', 'text', true)}
      {field('dress_code', 'Tenue demandée (facultatif)')}
      <label className="block text-sm">Nombre d’extras<input className="eb-input mt-1 w-full" type="number" min="1" max="50" required value={form.quantity} onChange={e => change('quantity', Number(e.target.value))} /></label>
      <label className="block text-sm">Tarif HT par extra<select className="eb-input mt-1 w-full" value={form.rate_kind} onChange={e => change('rate_kind', e.target.value)}><option value="none">À convenir</option><option value="hourly">Taux horaire</option><option value="fixed">Forfait du service</option></select></label>
      {form.rate_kind !== 'none' && field('rate', form.rate_kind === 'hourly' ? '€/heure HT' : 'Forfait € HT', 'number', true)}
      <label className="block text-sm">Informations utiles (facultatif)<textarea className="eb-input mt-1 w-full" maxLength={5000} value={form.notes} onChange={e => change('notes', e.target.value)} /></label>
      <label className="flex cursor-pointer items-start gap-4 rounded-2xl border-2 border-[#dba52a] bg-[#f9e8ad] p-5 text-base"><input className="mt-1 h-7 w-7 shrink-0 accent-[#91661a]" type="checkbox" checked={form.cascade} onChange={e => change('cascade', e.target.checked)} /><span><strong className="block">Chercher aussi dans le réseau Rivebelle</strong><span className="mt-2 block text-sm">Si {extraName || 'cet extra'} est indisponible ou que des places restent, proposer aussi à d’autres extras Rivebelle.</span><span className="mt-2 block text-sm text-[#705425]">Vos contacts d’abord, puis son réseau et les extras qui ont activé les propositions. Vous gardez le choix des candidats.</span></span></label>
      {!user && <div className="space-y-3 rounded-2xl bg-white p-4"><label className="block text-sm font-medium">Votre adresse email<input type="email" autoComplete="email" className="eb-input mt-2 w-full" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></label><p className="text-sm text-[#705425]">Aucun compte nécessaire. Un lien personnel envoyé par email vous permettra de choisir les extras et de gérer la mission.</p><p className="text-sm">Déjà un compte ? <Link className="font-semibold underline" to="/login" onClick={preserve}>Se connecter</Link> · <Link className="font-semibold underline" to="/register?role=client" onClick={preserve}>Créer un compte restaurateur</Link></p></div>}
      {user && user.role !== 'client' && <p role="alert" className="text-sm">Ce formulaire nécessite un compte restaurateur.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="min-h-[52px] w-full rounded-2xl bg-[#f3c64c] px-4 font-semibold text-[#352b1d] hover:bg-[#edba32] disabled:opacity-60" disabled={busy || (!!user && user.role !== 'client')}>{busy ? 'Envoi…' : user ? 'Envoyer la demande' : 'Recevoir mon lien et envoyer la demande'}</button>
    </form>}
    </SoftReveal>
  </section>;
}
