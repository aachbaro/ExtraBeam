import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useUserContext } from '../context/UserContext';
import { recruitmentApi, rememberHiringReturn, type HiringRequest } from '../recruitmentApi';
import RequestPage from './RequestPage';

export default function GuestRequestPage() {
  const { guestId } = useParams(); const { user } = useUserContext(); const navigate = useNavigate();
  const [token] = useState(() => {
    const secret = new URLSearchParams(location.hash.slice(1)).get('access');
    if (secret) { sessionStorage.setItem(`rivebelle-guest-${guestId}`, secret); history.replaceState(null, '', location.pathname); }
    return secret || sessionStorage.getItem(`rivebelle-guest-${guestId}`) || '';
  });
  const [req, setReq] = useState<HiringRequest | null>(null); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (!token) { setError('Ouvrez le lien personnel reçu par email pour accéder à cette demande.'); return; }
    void recruitmentApi<HiringRequest>(`guest/${guestId}/open/`, `guest:${token}`, 'POST', {}).then(value => { if (active) setReq(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [guestId, token]);
  async function claim() {
    if (!user?.token || !req) return;
    setBusy(true); setError('');
    try {
      const base = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8002/api').replace(/\/$/, '');
      const response = await fetch(`${base}/requests/${req.id}/guest/claim/`, { method: 'POST', headers: { Authorization: `Token ${user.token}`, 'X-Guest-Access': token } });
      if (!response.ok) { const value = await response.json(); throw new Error(value.detail || value[0] || 'Connectez-vous avec l’adresse utilisée pour cette demande.'); }
      sessionStorage.removeItem(`rivebelle-guest-${guestId}`); navigate(`/requests/${req.id}`, { replace: true });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="min-h-screen bg-[#f5efe4]">
    <section className="mx-auto max-w-4xl px-4 pt-6"><div className="rounded-2xl border border-[#dec99c] bg-[#f9e8ad] p-5">
      <h1 className="font-semibold">Votre mission, sans compte</h1><p className="mt-2 text-sm">Gardez le lien reçu par email pour retrouver vos candidats et suivre votre mission. Il est personnel.</p>
      {user ? <button className="eb-btn-primary mt-3" disabled={busy || !req} onClick={() => void claim()}>Rattacher cette demande à mon compte</button> : <p className="mt-3 text-sm">Pour tout retrouver au même endroit : <Link className="font-semibold underline" to="/login" onClick={() => rememberHiringReturn(`/guest/${guestId}`)}>Se connecter</Link> ou <Link className="font-semibold underline" to="/register?role=client" onClick={() => rememberHiringReturn(`/guest/${guestId}`)}>Créer un compte</Link>.</p>}
      {error && <p role="alert" className="mt-3 text-red-800">{error}</p>}
    </div></section>
    {!req && !error && <p role="status" className="p-6 text-center">Confirmation de votre adresse et ouverture de la demande…</p>}
    {req && <RequestPage guestAccess={{ id: req.id, token }} />}
  </div>;
}
