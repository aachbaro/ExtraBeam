import type { ReactNode } from 'react';

/** Animate the actual content height so following sections move with it. */
export default function SoftReveal({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  return <div id={id} className={`eb-soft-reveal${open ? ' is-open' : ''}`} aria-hidden={!open} {...(open ? {} : { inert: '' })}>
    <div className="eb-soft-reveal-clip"><div className="eb-soft-reveal-content">{children}</div></div>
  </div>;
}
