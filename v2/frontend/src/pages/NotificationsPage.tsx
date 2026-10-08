import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { useUserContext } from '../context/UserContext';
import { JOBS, recruitmentApi, rememberHiringReturn, type Preferences, type NotificationList } from '../recruitmentApi';

function vapidBytes(key: string) {
  const binary = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export default function NotificationsPage() {
  const { user } = useUserContext(); const [list, setList] = useState<NotificationList | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const load = useCallback(async () => {
    if (!user?.token) return;
    const [notifications, settings] = await Promise.all([recruitmentApi<NotificationList>('notifications/', user.token), recruitmentApi<Preferences>('notifications/preferences/', user.token)]);
    setList(notifications); setPrefs(settings);
  }, [user?.token]);
  useEffect(() => {
    void load().catch(e => setError(e.message));
    if ('serviceWorker' in navigator) void navigator.serviceWorker.getRegistration('/').then(async registration => {
      setSubscribed(!!await registration?.pushManager?.getSubscription());
    }).catch(() => {});
  }, [load]);
  async function save(patch: Partial<Preferences>) {
    if (!user?.token) return;
    setBusy(true); setError('');
    try { setPrefs(await recruitmentApi<Preferences>('notifications/preferences/', user.token, 'PATCH', patch)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function enablePush() {
    if (!user?.token || !prefs) return;
    setBusy(true); setError('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Ce navigateur ne prend pas en charge les notifications push.');
      if (await Notification.requestPermission() !== 'granted') throw new Error('Autorisez les notifications dans les réglages de votre navigateur pour les activer.');
      const registration = await navigator.serviceWorker.register('/rivebelle-sw.js');
      await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(prefs.vapid_public_key) });
      try { await recruitmentApi('notifications/push/', user.token, 'POST', sub.toJSON()); }
      catch (e) { await sub.unsubscribe(); throw e; }
      await save({ push: true }); setSubscribed(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function disablePush() {
    if (!user?.token) return; setBusy(true); setError('');
    try {
      const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : undefined;
      const sub = await registration?.pushManager.getSubscription();
      if (sub) { await recruitmentApi('notifications/push/', user.token, 'DELETE', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
      setSubscribed(false);
      await save({ push: false });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function markRead(id?: number) {
    if (!user?.token) return;
    try { setList(await recruitmentApi<NotificationList>('notifications/', user.token, 'POST', id ? { id } : {})); }
    catch (e) { setError((e as Error).message); }
  }
  if (!user?.token) return <main className="min-h-screen bg-eb-page"><div className="mx-auto max-w-3xl p-6"><Topbar warm /><Link className="eb-btn-primary mt-8 inline-block" to="/login" onClick={() => rememberHiringReturn('/notifications')}>Se connecter pour voir les notifications</Link></div></main>;
  return <main className="min-h-screen bg-eb-page"><div className="mx-auto max-w-3xl space-y-5 p-6"><Topbar warm /><h1 className="text-2xl font-semibold">Notifications</h1>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {prefs && <details className="rounded-xl border border-eb-layout bg-[#fffdf7] p-5"><summary className="cursor-pointer font-semibold">Mes préférences de notification et de propositions</summary>
      <div className="mt-4 space-y-3 text-sm">
        <p>Les notifications dans l’application restent toujours disponibles.</p>
        <label className="flex gap-2"><input type="checkbox" checked={prefs.email} disabled={busy} onChange={e => void save({ email: e.target.checked })} />Recevoir les événements importants par email</label>
        {!prefs.email_ready && <p className="text-eb-secondary">L’envoi d’emails attend la configuration du serveur.</p>}
        <div><button className="eb-btn-primary" disabled={busy || (!subscribed && !prefs.push_ready)} onClick={() => void (subscribed ? disablePush() : enablePush())}>{subscribed ? 'Désactiver les push sur cet appareil' : 'Activer les push sur cet appareil'}</button>
          {!prefs.push_ready && <p className="mt-2 text-eb-secondary">Les push attendent la configuration du serveur.</p>}</div>
        <label className="flex gap-2"><input type="checkbox" checked={prefs.sound} disabled={busy} onChange={e => void save({ sound: e.target.checked })} />Autoriser le son des push</label>
        <p className="text-xs text-eb-secondary">Le son et la vibration dépendent du téléphone, du navigateur et du mode silencieux. Sur iPhone, ajoutez Rivebelle à l’écran d’accueil puis activez les notifications depuis l’application.</p>
        {user.role === 'freelance' && <><label className="flex gap-2"><input type="checkbox" checked={prefs.broadcasts} disabled={busy} onChange={e => void save({ broadcasts: e.target.checked })} />Recevoir aussi les missions du réseau Rivebelle</label>
          <p>Postes souhaités (aucune sélection : tous les postes)</p><div className="flex flex-wrap gap-3">{Object.entries(JOBS).map(([key, name]) => <label key={key} className="flex gap-1"><input type="checkbox" checked={prefs.jobs.includes(key)} disabled={busy} onChange={e => void save({ jobs: e.target.checked ? [...prefs.jobs, key] : prefs.jobs.filter(job => job !== key) })} />{name}</label>)}</div></>}
      </div>
    </details>}
    {list && <><button className="eb-btn-ghost" onClick={() => void markRead()}>Tout marquer comme lu ({list.unread})</button>
      {!list.items.length && <p>Aucune notification pour le moment.</p>}
      {list.items.map(item => <Link key={item.id} to={item.url} onClick={() => void markRead(item.id)} className={`block rounded-xl border border-eb-layout p-4 ${item.read_at ? 'bg-[#fffdf7]' : 'bg-eb-primary/5'}`}><strong>{item.title}</strong><p className="text-sm">{item.body}</p><p className="mt-2 text-xs text-eb-secondary">{new Date(item.created_at).toLocaleString('fr-FR')} →</p></Link>)}
    </>}
  </div></main>;
}
