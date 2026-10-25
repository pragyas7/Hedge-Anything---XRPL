'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { emptyDesk, loadDesk, saveDesk, type DeskState } from '../state/desk';

interface DeskApi {
  state: DeskState;
  ready: boolean;
  update: (patch: Partial<DeskState> | ((prev: DeskState) => DeskState)) => void;
}

const DeskContext = createContext<DeskApi | null>(null);

export function useDesk(): DeskApi {
  const value = useContext(DeskContext);
  if (!value) throw new Error('Desk shell is missing.');
  return value;
}

const NAV = [
  ['/', 'Overview'],
  ['/risk', 'Risk'],
  ['/strategies', 'Strategies'],
  ['/markets', 'Markets'],
  ['/exchange', 'Exchange'],
  ['/operations', 'Operations'],
  ['/activity', 'Activity'],
] as const;

export function DeskShell({ demoMode, children }: { demoMode: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<DeskState>(emptyDesk);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    setState(loadDesk());
    setReady(true);
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  function update(patch: Partial<DeskState> | ((prev: DeskState) => DeskState)) {
    setState((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      saveDesk(next);
      return next;
    });
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('switchboard.theme', next);
    setTheme(next);
  }

  const organization = state.analysis?.company.name ?? 'No organization yet';
  const jurisdiction = state.analysis?.company.jurisdiction ?? 'Unset';

  return (
    <DeskContext.Provider value={{ state, ready, update }}>
      <a className="skip" href="#desk-main">Skip to desk</a>
      <div className="desk">
        <aside className="rail">
          <p className="brand">Switchboard</p>
          <nav aria-label="Desk">
            {NAV.map(([href, label]) => {
              const current = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link key={href} href={href} className="navlink" aria-current={current ? 'page' : undefined}>
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="maincol">
          <header className="topbar">
            <div>
              <p className="org">{organization}</p>
              <p className="jurisdiction">Jurisdiction {jurisdiction}</p>
            </div>
            <div className="top-actions">
              {demoMode ? (
                <p className="lamp"><span className="bulb" aria-hidden="true" /> Illustrative / Sandbox</p>
              ) : null}
              <Link className="btn-quiet" href="/onboard">Describe company</Link>
              <button type="button" className="btn-quiet" onClick={toggleTheme}>
                {theme === 'dark' ? 'Use light' : 'Use dark'}
              </button>
            </div>
          </header>
          <main id="desk-main">{children}</main>
        </div>
      </div>
    </DeskContext.Provider>
  );
}
