import type { Metadata } from 'next';
import Link from 'next/link';
import { Playfair_Display, Plus_Jakarta_Sans } from 'next/font/google';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LogoutButton } from '@/components/ui/LogoutButton';
import './globals.css';

const serif = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Deliberation',
  description: 'Structured multi-model AI discussions',
};

function Sidebar() {
  return (
    <aside
      className="fixed left-0 top-0 h-full w-64 flex-col hidden md:flex z-50"
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
    >
      <div className="px-6 pt-8 pb-6">
        <h1 className="dl-serif text-[1.35rem] tracking-tight" style={{ color: 'var(--sidebar-text)' }}>
          Deliberation
        </h1>
        <div className="flex items-center gap-2 mt-2.5">
          <div className="w-5 h-0.5 rounded-full" style={{ background: 'var(--sidebar-active)' }} />
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: 'var(--sidebar-text-muted)' }}
          >
            AI Round Table
          </p>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-0.5">
        <NavLink href="/" label="Library" icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
        <NavLink href="/new" label="New Session" icon="M12 4v16m8-8H4" />
        <NavLink href="/costs" label="Costs" icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
      </nav>
      <div className="px-3 pb-6">
        <div className="h-px mb-3" style={{ background: 'var(--sidebar-border)' }} />
        <ThemeToggle />
        <LogoutButton />
      </div>
    </aside>
  );
}

function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 mobile-nav-bg flex justify-around py-3.5 z-50" style={{ borderTop: '1px solid var(--border)' }}>
      <Link href="/" className="flex flex-col items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
        </svg>
        Library
      </Link>
      <Link href="/new" className="flex flex-col items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New
      </Link>
      <Link href="/costs" className="flex flex-col items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
        Costs
      </Link>
    </nav>
  );
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium"
      style={{ color: 'var(--sidebar-text-muted)' }}
    >
      <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      {label}
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.theme==='dark'||(!localStorage.theme&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}` }} />
      </head>
      <body>
        <Sidebar />
        <MobileNav />
        <main className="md:ml-64 min-h-screen px-5 py-6 md:px-10 md:py-8 pb-24 md:pb-8">{children}</main>
      </body>
    </html>
  );
}
