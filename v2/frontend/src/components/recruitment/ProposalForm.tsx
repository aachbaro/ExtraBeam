import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUserContext } from '../../context/UserContext';
import { JOBS, recruitmentApi, rememberHiringReturn, type HiringRequest } from '../../recruitmentApi';
import type { Unavailability } from '../../types';

interface Props { slug: string; extraName?: string; hourlyRate?: string | null; unavailabilities?: Unavailability[];
  externalSlot?: { date: string; start: string; end: string } | null }
interface Form { establishment: string; address: string; starts_at: string; ends_at: string; job: string; custom_job: string; dress_code: string;
  quantity: number; cascade: boolean; rate_kind: string; rate: string; notes: string }
const empty: Form = { establishment: '', address: '', starts_at: '', ends_at: '', job: 'service', custom_job: '', dress_code: '',
  quantity: 1, cascade: false, rate_kind: 'none', rate: '', notes: '' };

export default function ProposalForm({ slug, extraName, hourlyRate, externalSlot }: Props) {
  const { user } = useUserContext();
  const navigate = useNavigate();
  const storageKey = `rivebelle-proposal-${slug}`;
  const [form, setForm] = useState<Form>(() => {
    try { const draft = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); return { ...empty, rate: hourlyRate || '', ...draft }; }
    catch { return { ...empty, rate: hourlyRate || '' }; }
  });
  const [expanded, setExpanded] = useState(() => !!sessionStorage.getItem(storageKey));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
    if (!user?.token) { preserve(); navigate('/login'); return; }
    setBusy(true); setError('');
    try {
      const req = await recruitmentApi<HiringRequest>('requests/', user.token, 'POST', { ...form, target_slug: slug,
        starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString(),
        rate: form.rate_kind === 'none' ? null : form.rate });
      sessionStorage.removeItem(storageKey);
      navigate(`/requests/${req.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Envoi impossible.'); }
    finally { setBusy(false); }
  }
  const field = (key: 'establishment' | 'address' | 'starts_at' | 'ends_at' | 'dress_code' | 'custom_job' | 'rate', label: string, type = 'text', required = false) =>
    <label className="block text-sm">{label}<input className="eb-input mt-1 w-full" type={type} value={form[key]} onChange={e => change(key, e.target.value)} required={required}
      maxLength={key === 'address' ? 500 : 200} min={type === 'number' ? '.01' : undefined} step={type === 'number' ? '.01' : undefined} /></label>;
  return <section className="rounded-xl border border-eb-layout bg-white p-5">
    <button className="eb-btn-primary w-full" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>Proposer une mission à {extraName || 'cet extra'}</button>
    {expanded && <form onSubmit={submit} className="mt-5 space-y-4">
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
      <label className="flex gap-3 rounded-lg border-2 border-eb-primary/40 bg-eb-primary/5 p-4 text-sm"><input type="checkbox" checked={form.cascade} onChange={e => change('cascade', e.target.checked)} /><span>Si {extraName || 'cet extra'} est indisponible, proposer aussi à d’autres extras Rivebelle.<br /><span className="text-eb-secondary">Vos contacts d’abord, puis son réseau et les extras qui ont activé les propositions.</span></span></label>
      {!user && <p className="text-sm">Connectez-vous pour envoyer et suivre la demande. Les informations saisies seront conservées. <Link className="text-eb-primary underline" to="/register?role=client" onClick={preserve}>Créer un compte restaurateur</Link></p>}
      {user && user.role !== 'client' && <p role="alert" className="text-sm">Ce formulaire nécessite un compte restaurateur.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="eb-btn-primary w-full" disabled={busy || (!!user && user.role !== 'client')}>{busy ? 'Envoi…' : user ? 'Envoyer la demande' : 'Se connecter pour envoyer'}</button>
    </form>}
  </section>;
}
