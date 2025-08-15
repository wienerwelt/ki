// frontend/src/pages/LandingPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';

// --- Icon-Komponenten (Inline SVG für Performance und einfaches Styling) ---
const Icon = ({ path, className = "w-6 h-6" }: { path: string; className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d={path} />
    </svg>
);

const GlobeIcon = () => <Icon path="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z M2 12h20" className="w-4 h-4" />;
const ArrowRightIcon = () => <Icon path="M5 12h14 M12 5l7 7-7 7" className="w-5 h-5" />;
const ExternalLinkIcon = () => <Icon path="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14 21 3" className="w-4 h-4" />;
const LayoutDashboardIcon = () => <Icon path="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m9-11V5a2 2 0 0 0-2-2h-3m-1 8h-2m5 0h.01M16 16h.01" />;
const DatabaseIcon = () => <Icon path="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3 M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />;
const FileCheckIcon = () => <Icon path="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z M14 2v4a2 2 0 0 0 2 2h4 M9 12l2 2 4-4" />;

// --- Hauptkomponente: LandingPage ---
const LandingPage: React.FC = () => {
    // Stil für den "Glas"-Header
    const headerStyle: React.CSSProperties = {
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
    };

    return (
        <div className="min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col">
            {/* Header, passend zu mobiliti.at */}
            <header style={headerStyle} className="sticky top-0 z-40 w-full border-b border-slate-200/60 bg-white/80">
                <div className="mx-auto flex max-w-7xl items-center justify-between p-4">
                    <a href="https://mobiliti.at/" className="flex items-center gap-2 font-semibold">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white shadow">
                            <GlobeIcon />
                        </div>
                        <span className="text-lg">mobiliti</span>
                    </a>
                    {/* === GEÄNDERT: Button "Zur Homepage" mit Logo und Icon === */}
                    <a href="https://mobiliti.at/" className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold shadow transition-colors hover:bg-white">
                        <span>Zur Homepage</span>
                        <ExternalLinkIcon />
                    </a>
                </div>
            </header>

            {/* Hero-Sektion */}
            <main className="flex-grow flex items-center justify-center">
                {/* === GEÄNDERT: Vertikaler Abstand (py) reduziert === */}
                <section className="relative mx-auto max-w-5xl px-6 py-12 text-center">
                    {/* Hintergrund-Gradient */}
                    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                        <div className="absolute -top-40 left-1/2 h-[600px] w-[1200px] -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500/10 via-emerald-400/10 to-violet-500/10 blur-3xl"></div>
                    </div>

                    <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tighter text-slate-800">
                        Ihr Dashboard wartet auf Sie.
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
                        Verwandeln Sie komplexe Daten in klare Entscheidungen. Melden Sie sich an, um auf Ihre personalisierten Widgets und Analysen zuzugreifen.
                    </p>
                    
                    {/* === GEÄNDERT: Button-Text === */}
                    <Link
                        to="/login"
                        className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 px-8 py-4 font-semibold text-white shadow-lg transition-transform hover:scale-105"
                    >
                        <span>Anmelden</span>
                        <ArrowRightIcon />
                    </Link>

                    {/* === GEÄNDERT: Abstand nach oben (mt) reduziert === */}
                    <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
                        <div className="h-32 rounded-2xl bg-white/60 shadow-soft animate-[fadeIn_0.5s_ease-out_0.1s_both]"></div>
                        <div className="h-32 rounded-2xl bg-white/60 shadow-soft animate-[fadeIn_0.5s_ease-out_0.2s_both]"></div>
                        <div className="h-32 rounded-2xl bg-white/60 shadow-soft animate-[fadeIn_0.5s_ease-out_0.3s_both]"></div>
                        <div className="h-32 rounded-2xl bg-white/60 shadow-soft animate-[fadeIn_0.5s_ease-out_0.4s_both]"></div>
                    </div>
                </section>
            </main>

            {/* Feature-Sektion */}
            <section className="w-full bg-white/70 border-t border-slate-200/80 py-16">
                <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 md:grid-cols-3">
                    <div className="text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                            <LayoutDashboardIcon />
                        </div>
                        <h3 className="mt-4 text-lg font-semibold">Personalisierte Widgets</h3>
                        <p className="mt-1 text-slate-600">Stellen Sie sich Ihr Dashboard so zusammen, wie Sie es brauchen.</p>
                    </div>
                    <div className="text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                            <DatabaseIcon />
                        </div>
                        <h3 className="mt-4 text-lg font-semibold">Live-Daten & Analysen</h3>
                        <p className="mt-1 text-slate-600">Treffen Sie Entscheidungen auf Basis tagesaktueller Informationen.</p>
                    </div>
                    <div className="text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
                            <FileCheckIcon />
                        </div>
                        <h3 className="mt-4 text-lg font-semibold">Sichere Mediathek</h3>
                        <p className="mt-1 text-slate-600">Greifen Sie jederzeit auf wichtige Dokumente und Berichte zu.</p>
                    </div>
                </div>
            </section>
            
            {/* Animation Keyframes (werden von Tailwind verarbeitet) */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .shadow-soft {
                    box-shadow: 0 10px 30px rgba(2, 6, 23, 0.06);
                }
            `}</style>
        </div>
    );
};

export default LandingPage;
