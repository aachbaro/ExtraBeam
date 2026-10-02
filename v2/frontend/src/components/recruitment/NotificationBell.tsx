import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserContext } from '../../context/UserContext';
import { recruitmentApi, type NotificationList } from '../../recruitmentApi';

export default function NotificationBell() {
  const { user } = useUserContext(); const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user?.token) { setUnread(0); return; }
    let active = true;
    const load = () => recruitmentApi<NotificationList>('notifications/', user.token!).then(value => { if (active) setUnread(value.unread); }).catch(() => {});
    void load(); const timer = window.setInterval(load, 20000);
    return () => { active = false; clearInterval(timer); };
  }, [user?.token]);
  if (!user) return null;
  return <Link to="/notifications" className="eb-btn-ghost text-xs" aria-label={`Notifications, ${unread} non lues`}>Notifications{unread > 0 && <span className="ml-1 rounded-full bg-eb-primary px-2 py-0.5 text-white">{unread}</span>}</Link>;
}
