import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-serif/500.css';
import '@fontsource/ibm-plex-serif/600.css';
import './globals.css';
import type { ReactNode } from 'react';
import { DeskShell } from '../components/desk-shell';

export const metadata = {
  title: 'Switchboard',
  description: 'Hedge desk for a business exposure. Sandbox unless a service says otherwise.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';
  return (
    <html lang="en" className="dark">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('switchboard.theme')==='light')document.documentElement.classList.remove('dark');}catch(e){}",
          }}
        />
        <DeskShell demoMode={demoMode}>{children}</DeskShell>
      </body>
    </html>
  );
}
