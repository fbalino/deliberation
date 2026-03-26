import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Deliberation',
  description: 'Structured multi-model AI discussions',
};

function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-gray-900 text-white flex-col hidden md:flex z-50">
      <div className="p-6">
        <h1 className="text-xl font-bold tracking-tight">Deliberation</h1>
        <p className="text-xs text-gray-400 mt-1">AI Round Table</p>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        <NavLink href="/" label="Library" icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
        <NavLink href="/new" label="New Session" icon="M12 4v16m8-8H4" />
        <NavLink href="/costs" label="Costs" icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
      </nav>
    </aside>
  );
}

function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 text-white flex justify-around py-3 z-50">
      <Link href="/" className="flex flex-col items-center text-xs text-gray-300 hover:text-white">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
        </svg>
        Library
      </Link>
      <Link href="/new" className="flex flex-col items-center text-xs text-gray-300 hover:text-white">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New
      </Link>
      <Link href="/costs" className="flex flex-col items-center text-xs text-gray-300 hover:text-white">
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
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
    >
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      {label}
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <Sidebar />
        <MobileNav />
        <main className="md:ml-60 min-h-screen p-4 md:p-8 pb-20 md:pb-8">{children}</main>
      </body>
    </html>
  );
}
