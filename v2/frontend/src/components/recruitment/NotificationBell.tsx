import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserContext } from '../../context/UserContext';
import { recruitmentApi, type NotificationList } from '../../recruitmentApi';

export default function NotificationBell({ align = 'left' }: { align?: 'left' | 'right' }) {
  const { user } = useUserContext();
  const navigate = useNavigate();
  const [data, setData] = useState<NotificationList | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.token) { setData(null); return; }
    let active = true;
    const load = () =>
      recruitmentApi<NotificationList>('notifications/', user.token!)
        .then(value => { if (active) setData(value); })
        .catch(() => {});
    void load();
    const timer = window.setInterval(load, 20000);
    return () => { active = false; clearInterval(timer); };
  }, [user?.token]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  if (!user) return null;

  const unread = data?.unread ?? 0;
  const items = data?.items?.slice(0, 6) ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={`Notifications${unread > 0 ? `, ${unread} non lues` : ''}`}
        className="relative flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[#f0e8d8]"
        style={{ color: open ? "#6b3d00" : "#947239" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
            style={{ background: "#c0392b" }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full z-50 mt-2 w-72 max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border shadow-xl`}
          style={{ background: "#fdf8f1", borderColor: "#e0d4bf" }}
        >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "#e0d4bf" }}>
            <p className="text-[12px] font-semibold" style={{ color: "#352b1d" }}>Notifications</p>
            {unread > 0 && (
              <span className="text-[11px]" style={{ color: "#947239" }}>
                {unread} non lue{unread > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-5 text-center text-[13px]" style={{ color: "#947239" }}>
              Aucune notification
            </p>
          ) : (
            <ul className="max-h-64 divide-y overflow-y-auto" style={{ borderColor: "#f0e8d8" }}>
              {items.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-[#f5efe4]"
                    onClick={() => { setOpen(false); navigate(item.url || '/notifications'); }}
                  >
                    <p
                      className="text-[13px] leading-snug"
                      style={{ color: "#352b1d", fontWeight: item.read_at ? 400 : 600 }}
                    >
                      {item.title}
                      {!item.read_at && (
                        <span
                          className="ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
                          style={{ background: "#c0392b" }}
                        />
                      )}
                    </p>
                    {item.body && (
                      <p className="mt-0.5 line-clamp-2 text-[12px]" style={{ color: "#947239" }}>
                        {item.body}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t px-4 py-2.5" style={{ borderColor: "#e0d4bf" }}>
            <button
              type="button"
              className="text-[12px] transition-opacity hover:opacity-70"
              style={{ color: "#947239" }}
              onClick={() => { setOpen(false); navigate('/notifications'); }}
            >
              Toutes les notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
