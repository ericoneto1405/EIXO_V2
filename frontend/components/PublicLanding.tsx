import React from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, TrendingDown, TrendingUp, Lightbulb, Menu, X } from 'lucide-react';

interface PublicLandingProps {
  onEnter: () => void;
  onRegister: () => void;
}

const FREE_FEATURES = [
  'Animais ilimitados',
  'Pesagens e GMD automático',
  'Manejo do Rebanho completo',
  'Lotes e pastos',
  'Estrutura da Fazenda',
  'Receitas, despesas e resultado',
  'Dashboard com indicadores',
  'Até 3 usuários',
];

const STEPS = [
  {
    n: '01',
    title: 'Crie sua conta',
    desc: 'Leva menos de 2 minutos. Sem cartão.',
  },
  {
    n: '02',
    title: 'Cadastre sua fazenda e o rebanho',
    desc: 'Adicione os dados essenciais para começar a acompanhar sua operação.',
  },
  {
    n: '03',
    title: 'Comece a enxergar sua operação',
    desc: 'Pesagens, compras, vendas e financeiro no mesmo lugar.',
  },
];

const FAQS = [
  {
    q: 'Funciona no celular?',
    a: 'Sim. O EIXO foi pensado para funcionar em qualquer dispositivo — celular, tablet ou computador. Ideal para quem está no campo.',
  },
  {
    q: 'É difícil de usar?',
    a: 'Não. O sistema foi feito para quem trabalha na fazenda, sem linguagem técnica.',
  },
  {
    q: 'O plano grátis limita o número de animais?',
    a: 'Não. No EIXO Essencial, os animais são ilimitados. O plano inclui 1 fazenda e até 3 usuários.',
  },
  {
    q: 'Meus dados ficam seguros?',
    a: 'Seus dados ficam armazenados em servidores seguros, em conformidade com a LGPD. Você tem acesso completo ao histórico a qualquer momento.',
  },
  {
    q: 'Quando faz sentido pagar?',
    a: 'Os planos pagos fazem sentido quando você precisa de múltiplas fazendas, mais usuários ou módulos avançados. Você escolhe quando evoluir.',
  },
  {
    q: 'Serve para gado comercial e P.O.?',
    a: 'Sim. O EIXO foi pensado para organizar tanto rebanho comercial quanto animais P.O., respeitando as diferenças de registro, genealogia, reprodução e seleção.',
  },
];

const PublicLanding: React.FC<PublicLandingProps> = ({ onEnter, onRegister }) => {
  const [activeFaq, setActiveFaq] = React.useState<number | null>(null);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [showMobileCta, setShowMobileCta] = React.useState(false);
  const [activeNav, setActiveNav] = React.useState<'gratis' | 'antes-depois' | 'como' | 'faq'>('gratis');
  const heroCtaRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  React.useEffect(() => {
    const heroCta = heroCtaRef.current;
    if (!heroCta || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setShowMobileCta(!entry.isIntersecting),
      { threshold: 0.2 },
    );

    observer.observe(heroCta);
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
  };

  const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--eixo-green)] px-6 py-3 text-lg font-bold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]';
  const btnSecondary = 'inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-3 text-sm font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-bg)]';
  const headerPrimaryButton = 'hidden h-10 items-center justify-center gap-2 rounded-xl border border-[rgba(182,226,58,0.76)] bg-[rgba(182,226,58,0.82)] px-5 text-sm font-bold text-[#1a1a1a] shadow-[0_10px_22px_rgba(121,160,24,0.18),inset_0_1px_0_rgba(255,255,255,0.58)] transition-all duration-200 hover:bg-[rgba(182,226,58,0.92)] hover:shadow-[0_12px_28px_rgba(121,160,24,0.24),inset_0_1px_0_rgba(255,255,255,0.66)] sm:inline-flex';
  const navItems: Array<{ label: string; id: 'gratis' | 'antes-depois' | 'como' | 'faq'; action: () => void }> = [
    { label: 'EIXO Essencial', id: 'gratis', action: () => { setActiveNav('gratis'); scrollTo('gratis'); } },
    { label: 'Antes e Depois', id: 'antes-depois', action: () => { setActiveNav('antes-depois'); scrollTo('antes-depois'); } },
    { label: 'Como funciona', id: 'como', action: () => { setActiveNav('como'); scrollTo('como'); } },
    { label: 'Dúvidas', id: 'faq', action: () => { setActiveNav('faq'); scrollTo('faq'); } },
  ];

  return (
    <div className="min-h-screen bg-[var(--eixo-bg)] text-[var(--eixo-text)]">

      {/* ── Nav ── */}
      <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${isScrolled ? 'border-b border-[var(--eixo-border)] bg-[var(--eixo-bg)]/95 shadow-sm backdrop-blur' : 'bg-[var(--eixo-bg)]'}`}>
        <div className="mx-auto flex h-[75px] max-w-7xl items-center justify-between px-4 lg:px-8">
          <div className="inline-flex flex-col items-center leading-none">
            <img src="/logo_eixo_official.svg" alt="EIXO" className="h-[2.53575rem] w-auto" />
            <div className="mt-[4px] text-[10px] font-semibold uppercase tracking-[0.18em] whitespace-nowrap text-[var(--eixo-text)]/75">
              Tecnologia para Gestão Pecuária
            </div>
          </div>
          <nav
            className="hidden items-center rounded-2xl border border-white/45 bg-white/22 p-1 shadow-[0_12px_30px_rgba(47,47,47,0.07),inset_0_1px_0_rgba(255,255,255,0.56)] backdrop-blur-xl lg:flex"
          >
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                className={`inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-sm font-semibold tracking-[0.01em] transition-colors ${
                  item.id === activeNav
                    ? 'bg-[rgba(240,249,212,0.68)] text-[var(--eixo-graphite)]'
                    : 'text-[var(--eixo-text)]/82 hover:bg-white/36 hover:text-[var(--eixo-text)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="rounded-xl border border-white/50 bg-white/34 p-2 text-[var(--eixo-text)] shadow-[0_8px_22px_rgba(47,47,47,0.10),inset_0_1px_0_rgba(255,255,255,0.66)] backdrop-blur-xl transition-colors hover:bg-white/52 lg:hidden"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={onEnter}
              className="hidden h-10 items-center px-1 text-sm font-semibold text-[var(--eixo-text-muted)] transition-colors hover:text-[var(--eixo-text)] hover:underline sm:inline-flex"
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/planos'; }}
              className="hidden h-10 items-center rounded-xl border border-white/62 bg-white/46 px-4 text-sm font-semibold text-[var(--eixo-text)] shadow-[0_9px_20px_rgba(47,47,47,0.10),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl transition-all duration-200 hover:border-white/86 hover:bg-white/62 sm:inline-flex"
            >
              Ver Planos
            </button>
            <button type="button" onClick={onRegister} className={headerPrimaryButton}>
              Criar minha conta grátis
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-b border-[var(--eixo-border)] bg-[var(--eixo-bg)] px-4 py-3 lg:hidden">
            <button
              type="button"
              onClick={() => {
                scrollTo('gratis');
                setMenuOpen(false);
              }}
              className="w-full py-3 text-left text-base font-brand font-semibold text-[var(--eixo-text)]"
            >
              EIXO Essencial
            </button>
            <button
              type="button"
              onClick={() => {
                scrollTo('como');
                setMenuOpen(false);
              }}
              className="w-full py-3 text-left text-base font-brand font-semibold text-[var(--eixo-text)]"
            >
              Como funciona
            </button>
            <button
              type="button"
              onClick={() => {
                scrollTo('faq');
                setMenuOpen(false);
              }}
              className="w-full py-3 text-left text-base font-brand font-semibold text-[var(--eixo-text)]"
            >
              Dúvidas
            </button>
            <div className="my-2 border-t border-[var(--eixo-border)]" />
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onEnter();
              }}
              className="w-full px-1 py-2 text-left text-sm font-semibold text-[var(--eixo-text-muted)] transition-colors hover:text-[var(--eixo-text)] hover:underline"
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                window.location.href = '/planos';
              }}
              className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-3 text-left text-sm font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
            >
              Ver Planos
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRegister();
              }}
              className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--eixo-green)] px-5 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]"
            >
              Criar minha conta grátis
            </button>
          </div>
        )}
      </header>

      <main className="pt-[75px]">

        {/* ── Hero ── */}
        <section
          className={`relative min-h-[calc(100svh-75px)] overflow-hidden pb-20 lg:pb-24 ${
            isScrolled
              ? '-mt-4 pt-24 lg:-mt-6 lg:pt-32'
              : 'pt-12 lg:pt-16'
          }`}
        >
          <div
            className="absolute inset-0 opacity-[0.60]"
            style={{
              backgroundImage: "url('/homem de costas no curral.png')",
              backgroundPosition: 'center 42%',
              backgroundSize: 'cover',
            }}
          />
          <div className="absolute inset-0 bg-[rgba(255,250,241,0.58)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--eixo-surface)]/90 via-[var(--eixo-bg)]/96 to-[var(--eixo-bg)]" />

          <div className="relative z-10 mx-auto max-w-5xl px-4 text-left lg:px-8">

            <div className="mb-6 flex justify-center">
              <div className="inline-flex items-center rounded-full border border-[var(--eixo-green)] bg-[var(--eixo-green-soft)] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                EIXO Essencial · R$ 0/mês
              </div>
            </div>

            <h1 className="font-brand text-balance text-3xl font-semibold tracking-[0.01em] leading-[1.12] text-[var(--eixo-text)] sm:text-4xl lg:text-6xl">
              Gestão pecuária no eixo.<br />
              <span className="text-[#7aad1a]">Decisão na mão.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl font-sans text-lg font-normal leading-relaxed text-[var(--eixo-text-muted)] lg:text-xl">
              Controle rebanho, pesagens, pastos e financeiro em um só lugar. Comece grátis no EIXO Essencial, sem cartão e sem limite de animais.
            </p>

            <div className="mt-3 flex justify-center">
              <p className="text-center text-xs text-[var(--eixo-text-muted)]/70">
                1 fazenda · até 3 usuários · animais ilimitados
              </p>
            </div>

            <div className="mt-5 flex justify-center">
              <div className="inline-flex items-center rounded-full bg-[var(--eixo-green-soft)] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[var(--eixo-graphite)]">
                Sem cartão · acesso imediato
              </div>
            </div>

            <div ref={heroCtaRef} className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button type="button" onClick={onRegister} className={`${btnPrimary} h-12 px-8 text-base`}>
                Criar minha conta grátis
                <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => scrollTo('como')} className={`${btnSecondary} h-12 px-8 text-base`}>
                Ver como funciona
              </button>
            </div>

          </div>
        </section>

        {/* ── Demonstração do produto ── */}
        <section className="bg-[var(--eixo-surface)] py-20 lg:py-28">
          <div className="mx-auto max-w-6xl px-4 lg:px-8">
            <div className="mx-auto mb-10 max-w-3xl text-center">
              <h2 className="font-brand text-3xl font-extrabold text-[var(--eixo-text)] lg:text-4xl">Veja o EIXO em uso</h2>
              <p className="mt-4 text-lg text-[var(--eixo-text-muted)]">
                Informações importantes da operação reunidas para facilitar o acompanhamento e a decisão.
              </p>
            </div>

            <figure>
              <div className="overflow-hidden rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-bg)] p-2 shadow-xl shadow-black/10 lg:p-4">
                <img
                  src="/eixo-dashboard-demo.webp"
                  alt="Dashboard do EIXO com indicadores do rebanho, pesagens e financeiro."
                  className="h-auto w-full rounded-2xl"
                  loading="lazy"
                />
              </div>
              <figcaption className="mt-3 text-center text-sm text-[var(--eixo-text-muted)]">
                Prévia do dashboard do EIXO com dados demonstrativos.
              </figcaption>
            </figure>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {['Rebanho e indicadores reunidos', 'Pesagens e GMD acompanhados', 'Receitas e despesas da fazenda'].map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-bg)] p-4">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-[var(--eixo-green-dark)]" />
                  <span className="font-semibold text-[var(--eixo-text)]">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── O que é grátis ── */}
        <section id="gratis" className="relative overflow-hidden bg-[var(--eixo-surface)] py-20 lg:py-28">
          <div
            className="absolute inset-0 opacity-[0.60]"
            style={{ backgroundImage: "url('/pasture-horizon.jpg')", backgroundPosition: 'center', backgroundSize: 'cover' }}
          />

          <div className="relative z-10 mx-auto max-w-5xl px-4 lg:px-8">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                EIXO Essencial
              </div>
              <h2 className="font-brand text-3xl font-extrabold text-[var(--eixo-text)] lg:text-4xl">
                O essencial para organizar sua fazenda desde o primeiro dia.
              </h2>
              <p className="mt-4 text-lg text-[var(--eixo-text-muted)]">
                No EIXO Essencial, você cadastra 1 fazenda e até 3 usuários, com animais ilimitados. Sem cartão e sem prazo. <span className="font-semibold text-[var(--eixo-text)]">Acasalamento Inteligente</span> disponível no plano pago.
              </p>
            </div>

            <div className="rounded-3xl border-2 border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-8 shadow-sm lg:p-12">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {FREE_FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--eixo-green-soft)]">
                      <CheckCircle2 className="h-4 w-4 text-[var(--eixo-green-dark)]" />
                    </div>
                    <span className="text-sm font-semibold text-[var(--eixo-text)]">{f}</span>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-col items-center gap-3 border-t border-[var(--eixo-border)] pt-8 sm:flex-row sm:justify-between">
                <div>
                  <p className="text-2xl font-extrabold text-[var(--eixo-text)]">R$ 0 / mês</p>
                  <p className="text-sm text-[var(--eixo-text-muted)]">Não precisa cadastrar cartão para começar!</p>
                </div>
                <div className="flex flex-col items-center gap-2 sm:items-end">
                  <button type="button" onClick={onRegister} className={`${btnPrimary} h-12 px-8`}>
                    Criar minha conta grátis
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => scrollTo('como')} className="text-sm font-medium text-[var(--eixo-text-muted)] underline underline-offset-2 transition-colors hover:text-[var(--eixo-text)]">
                    Como funciona? →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Antes e depois ── */}
        <section id="antes-depois" className="bg-gradient-to-b from-[#EDEDED] to-white py-20 lg:py-28">
          <div className="mx-auto max-w-5xl px-4 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="font-brand text-3xl font-extrabold text-[var(--eixo-text)] lg:text-4xl">
                Você já registra. O EIXO transforma informação em gestão.
              </h2>
              <p className="mx-auto mt-4 max-w-3xl text-lg text-[var(--eixo-text-muted)]">
                A rotina da fazenda já gera informação todos os dias. O EIXO coloca esses dados em ordem para ajudar na gestão.
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="block sm:hidden rounded-2xl border border-[var(--eixo-border)] bg-[#f7f8f6] p-6">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--eixo-text-soft)]">Sem sistema</p>
                <div className="space-y-2 text-base text-[var(--eixo-graphite)]" style={{ fontFamily: "'Caveat', cursive" }}>
                  <p>Lote 14 - 247 cab - pesagem 12/03</p>
                  <p style={{ color: '#1e3f72' }}>comprou ração 15t ontem</p>
                  <p>morreu 2 no pasto B-08 <span style={{ color: '#c0392b' }}></span></p>
                  <p style={{ color: '#1e3f72' }}>santa rita precisa vacinar</p>
                  <p>vender lote A? preço tá ruim...</p>
                  <p style={{ color: '#2a4a80' }}>peso médio caiu? conferir amanhã</p>
                </div>
              </div>

              {/* Antes — caderno amassado */}
              <div className="hidden sm:block">
              <div className="relative" style={{ perspective: '600px' }}>
                <div className="absolute inset-x-2 bottom-0 hidden h-full overflow-hidden rounded-2xl lg:block" style={{ background: '#eef1e7', transform: 'rotate(2.5deg) translateY(4px)', zIndex: 0 }}>
                  <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.15rem', color: 'var(--eixo-graphite)', opacity: 0.28, filter: 'blur(2.5px)', padding: '52px 56px 0 56px', lineHeight: '28px' }}>
                    <p style={{ transform: 'rotate(-0.5deg)' }}>vacina aftosa — 340 cab</p>
                    <p style={{ transform: 'rotate(0.3deg)', marginTop: 28 }}>custo ração jun: R$ 18.400</p>
                    <p style={{ transform: 'rotate(-0.4deg)', marginTop: 28 }}>pasto C vazio — lotar?</p>
                    <p style={{ transform: 'rotate(0.6deg)', marginTop: 28 }}>liga pro João sobre venda</p>
                    <p style={{ transform: 'rotate(-0.2deg)', marginTop: 28 }}>conferir peso lote 7</p>
                  </div>
                </div>

                <div className="absolute inset-x-1 bottom-0 hidden h-full overflow-hidden rounded-2xl lg:block" style={{ background: '#f3f5f1', transform: 'rotate(-1.5deg) translateY(2px)', zIndex: 1 }}>
                  <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.15rem', color: 'var(--eixo-graphite)', opacity: 0.32, filter: 'blur(1.8px)', padding: '52px 52px 0 52px', lineHeight: '28px' }}>
                    <p style={{ transform: 'rotate(0.4deg)' }}>boi gordo @ R$ 312 arr.</p>
                    <p style={{ transform: 'rotate(-0.5deg)', marginTop: 28 }}>lote 14 — GMD caindo</p>
                    <p style={{ transform: 'rotate(0.3deg)', marginTop: 28 }}>remédio pra brucelose</p>
                    <p style={{ transform: 'rotate(-0.3deg)', marginTop: 28 }}>contar novilhas fazenda 2</p>
                    <p style={{ transform: 'rotate(0.5deg)', marginTop: 28 }}>NF da ração — guardar</p>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-2xl px-6 pb-6 pt-5" style={{ zIndex: 2, background: '#f7f8f6', backgroundImage: `repeating-linear-gradient(transparent, transparent 27px, #d0d8d0 27px, #d0d8d0 28px), linear-gradient(to right, transparent 42px, #c7cec7 42px, #c7cec7 44px, transparent 44px)`, transform: 'rotate(-1.2deg)', boxShadow: '3px 4px 12px rgba(0,0,0,0.18), -2px -1px 6px rgba(0,0,0,0.08)', fontFamily: "'Caveat', 'Patrick Hand', 'Comic Sans MS', cursive" }}>
                  <div className="absolute left-0 top-0 flex h-full flex-col justify-around py-6 pl-1.5">
                    {[0,1,2,3].map(i => (
                      <div key={i} className="h-4 w-4 rounded-full bg-[var(--eixo-surface-soft)] shadow-inner" style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)' }} />
                    ))}
                  </div>
                  <div className="pointer-events-none absolute right-8 top-4 h-14 w-14 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #8B4513 30%, transparent 70%)' }} />
                  <div className="pointer-events-none absolute bottom-10 left-14 h-7 w-7 rounded-full opacity-8" style={{ background: 'radial-gradient(circle, #6B4226 40%, transparent 70%)', opacity: 0.07 }} />
                  <p className="mb-3 pl-10 text-xs font-bold uppercase tracking-[0.16em] text-[var(--eixo-text-soft)]" style={{ fontFamily: 'inherit' }}>Sem sistema</p>
                  <div className="space-y-1 pl-14 pr-2" style={{ fontFamily: 'inherit' }}>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(-0.3deg)', color: 'var(--eixo-graphite)' }}>Lote 14 - 247 cab - pesagem 12/03</p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(0.4deg)', color: '#1e3f72' }}>comprou ração 15t ontem</p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(-0.2deg)', color: 'var(--eixo-graphite)' }}>morreu 2 no pasto B-08 <span style={{ color: '#c0392b' }}>(!)</span></p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(0.5deg)', color: '#1e3f72' }}>santa rita precisa vacinar</p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(-0.4deg)', color: 'var(--eixo-graphite)' }}>vender lote A? preço tá ruim...</p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(0.2deg)', color: '#2a4a80' }}>peso médio caiu? conferir amanhã</p>
                  </div>
                </div>
              </div>
              </div>

              {/* Depois */}
              <div className="rounded-3xl border-2 border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 shadow-sm">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-[var(--eixo-text)]">Com o EIXO</p>
                <div className="space-y-3">
                  <div className="flex gap-3 rounded-2xl border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] p-3">
                    <TrendingDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--eixo-danger)]" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--eixo-text)]">Mortalidade acima do esperado — Pasto B-08</p>
                      <p className="text-xs text-[var(--eixo-text-muted)]">2 mortes em 7 dias. Verificar manejo.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-2xl border border-[#b6d4b0] bg-[var(--eixo-green-soft)] p-3">
                    <TrendingUp className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--eixo-success)]" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--eixo-text)]">Lote A-14 pronto para venda</p>
                      <p className="text-xs text-[var(--eixo-text-muted)]">Peso médio 485 kg · GMD 1,2 kg/dia</p>
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] p-3">
                    <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--eixo-green)]" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--eixo-text)]">Custo com ração subiu 12% no mês</p>
                      <p className="text-xs text-[var(--eixo-text-muted)]">Revisar dieta e fornecedores da fazenda Santa Rita.</p>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm text-[var(--eixo-text-muted)] italic">Cada informação no lugar certo, com contexto.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Como funciona ── */}
        <section id="como" className="relative overflow-hidden bg-[var(--eixo-surface)] py-20 lg:py-28">
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage: "url('/vista_aerea_fazenda_eixo.png')",
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }}
          />
          <div className="absolute inset-0 bg-[var(--eixo-surface)]/90" />
          <div className="relative z-10 mx-auto max-w-5xl px-4 lg:px-8">
            <div className="mb-16 text-center">
              <h2 className="font-brand text-3xl font-extrabold text-[var(--eixo-text)] lg:text-4xl">Como começar</h2>
              <p className="mt-4 text-lg text-[var(--eixo-text-muted)]">Três passos. Menos de 10 minutos.</p>
            </div>

            {/* Timeline */}
            <div className="relative">
              {/* Linha conectora — visível só em desktop */}
              <div className="absolute left-0 right-0 top-10 hidden h-px bg-gradient-to-r from-transparent via-[var(--eixo-border)] to-transparent md:block" />

              <div className="grid gap-10 md:grid-cols-3">

                {/* Passo 1 */}
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-6">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--eixo-green)] shadow-lg shadow-[var(--eixo-green)]/30">
                      <svg className="h-8 w-8 text-[#1a1a1a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--eixo-text)] text-xs font-bold text-white">1</span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--eixo-text)]">Crie sua conta</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--eixo-text-muted)]">Leva menos de 2 minutos. Sem cartão, sem burocracia.</p>
                </div>

                {/* Passo 2 */}
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-6">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--eixo-green)] shadow-lg shadow-[var(--eixo-green)]/30">
                      <svg className="h-8 w-8 text-[#1a1a1a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--eixo-text)] text-xs font-bold text-white">2</span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--eixo-text)]">Cadastre sua fazenda e o rebanho</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--eixo-text-muted)]">Adicione os dados essenciais para começar a acompanhar sua operação.</p>
                </div>

                {/* Passo 3 */}
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-6">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--eixo-green)] shadow-lg shadow-[var(--eixo-green)]/30">
                      <svg className="h-8 w-8 text-[#1a1a1a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--eixo-text)] text-xs font-bold text-white">3</span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--eixo-text)]">Comece a enxergar sua operação</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--eixo-text-muted)]">Pesagens, compras, vendas e financeiro no mesmo lugar.</p>
                </div>

              </div>
            </div>

            <div className="mt-14 text-center">
              <button type="button" onClick={onRegister} className={`${btnPrimary} h-12 px-8`}>
                Criar minha conta grátis
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="bg-[var(--eixo-surface-soft)]/80 py-20 lg:py-28">
          <div className="mx-auto max-w-3xl px-4 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="font-brand text-3xl font-extrabold text-[var(--eixo-text)] lg:text-4xl">Perguntas frequentes</h2>
            </div>
            <div className="space-y-3">
              {FAQS.map((faq, i) => {
                const open = activeFaq === i;
                return (
                  <div key={faq.q} className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                    <button type="button" onClick={() => setActiveFaq(open ? null : i)} className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left">
                      <span className="font-semibold text-[var(--eixo-text)]">{faq.q}</span>
                      <ChevronDown className={`h-5 w-5 flex-shrink-0 text-[var(--eixo-text-soft)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && (
                      <div className="border-t border-[var(--eixo-border)] px-6 pb-5 pt-4 text-sm leading-relaxed text-[var(--eixo-text-muted)]">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── CTA Final ── */}
        <section className="bg-[var(--eixo-text)] py-20 pb-28 sm:pb-20 lg:py-28">
          <div className="mx-auto max-w-3xl px-4 text-center lg:px-8">
            <h2 className="font-brand text-balance text-3xl font-extrabold text-[#f5f0e8] lg:text-5xl">
              Tire a gestão do caderno e leve sua fazenda para o EIXO.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[var(--eixo-text-soft)]">
              Comece pelo EIXO Essencial: R$ 0/mês, sem cartão e com animais ilimitados.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button type="button" onClick={onRegister} className="inline-flex items-center gap-2 rounded-xl bg-[var(--eixo-green)] px-8 py-4 text-base font-bold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]">
                Criar minha conta grátis
                <ArrowRight className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => { window.location.href = '/planos'; }} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-8 py-4 text-base font-semibold text-white/70 transition-colors hover:border-white/40 hover:text-white">
                Ver planos
              </button>
            </div>
            <p className="mt-4 text-sm text-[#d6d3d1]">Sem cartão · Sem prazo · Animais ilimitados</p>
          </div>
        </section>

      </main>

      <footer className="border-t border-[var(--eixo-border)] bg-[var(--eixo-surface)] py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-sm text-[var(--eixo-text-muted)] md:flex-row lg:px-8">
          <p>© 2026 EIXO · Plataforma de gestão pecuária</p>
          <div className="flex items-center gap-6">
            <a href="#" className="transition-colors hover:text-[var(--eixo-text)]">Termos</a>
            <a href="#" className="transition-colors hover:text-[var(--eixo-text)]">Privacidade</a>
            <a href="#" className="transition-colors hover:text-[var(--eixo-text)]">Contato</a>
          </div>
        </div>
      </footer>

      {/* CTA fixo mobile */}
      {showMobileCta && <div className="fixed bottom-4 left-4 right-4 z-40 sm:hidden">
        <button type="button" onClick={onRegister} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--eixo-green)] px-5 py-4 font-bold text-[#1a1a1a] shadow-lg hover:bg-[var(--eixo-green-dark)]">
          Criar minha conta grátis
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>}
    </div>
  );
};

export default PublicLanding;
