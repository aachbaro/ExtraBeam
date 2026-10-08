import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { recruitmentApi, STATES, type HiringRequest } from '../../recruitmentApi';

export default function RequestsSection({ token }: { token: string }) {
  const [requests, setRequests] = useState<HiringRequest[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => recruitmentApi<HiringRequest[]>('requests/', token).then(value => {
      if (active) { setRequests(value); setError(''); }
    }).catch(e => { if (active) setError(e.message); });
    void load(); const interval = window.setInterval(load, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [token]);
  return <section className="eb-content-stagger mb-8 space-y-3">
    <h2 className="text-xl font-semibold">Demandes et recrutement</h2>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!requests && !error && <p role="status">Chargement des demandes…</p>}
    {requests?.length === 0 && <p className="text-sm text-eb-secondary">Aucune demande pour le moment. Les propositions et les missions confirmées apparaîtront ici.</p>}
    {requests?.map(req => <Link key={req.id} to={`/requests/${req.id}`} className="block rounded-xl border border-eb-layout bg-white p-4 hover:border-eb-primary">
      <div className="flex flex-wrap justify-between gap-2"><strong>{req.establishment}</strong><span className="text-sm text-eb-primary">{STATES[req.status]}</span></div>
      <p className="mt-1 text-sm">{new Date(req.starts_at).toLocaleString('fr-FR')} · {req.quantity} extra{req.quantity > 1 ? 's' : ''}</p>
      <p className="mt-2 text-sm text-eb-secondary">{req.is_client ? `${req.interested_count} candidature(s) · ${req.remaining} place(s) restante(s)` : STATES[req.offers[0]?.state] || 'Voir la proposition'} →</p>
    </Link>)}
  </section>;
}
