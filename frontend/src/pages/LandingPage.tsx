// frontend/src/pages/LandingPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
// Der Import von './LandingPage.css' wird nicht mehr benötigt.

const LandingPage: React.FC = () => {
    // Spezifische Stile, die über Tailwind hinausgehen, werden hier definiert.
    const headerStyle = {
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)', // Für Safari-Kompatibilität
    };

    return (
        <div className="min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col">
            {/* Header */}
            <header style={headerStyle} className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
                    <a href="https://mobiliti.at/" className="flex items-center gap-2 font-semibold tracking-tight">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                        </div>
                        <span className="text-lg md:text-xl">mobiliti</span>
                    </a>
                    <a href="https://mobiliti.at/" className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold shadow hover:bg-white">
                        Zur Homepage
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    </a>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-grow flex items-center justify-center">
                <section className="relative mx-auto max-w-4xl px-6 py-16 text-center">
                    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                        <div className="absolute -top-40 left-1/2 h-[600px] w-[1200px] -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500/10 via-emerald-400/10 to-violet-500/10 blur-3xl"></div>
                    </div>
                    
                    <h1 className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">
                        Sie wurden erfolgreich ausgeloggt.
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-base md:text-lg text-slate-700/90">
                        Vielen Dank für Ihren Besuch. Wir hoffen, Sie bald wieder im mobiliti Dashboard begrüßen zu dürfen.
                    </p>
                    
                    <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <Link
                            to="/login" // Relativer Link
                            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-500 px-6 py-3 font-semibold text-white shadow-lg hover:opacity-95 transition-opacity"
                        >
                            <span>Erneut Anmelden</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default LandingPage;
