import React from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, TrendingDown, TrendingUp, Lightbulb } from 'lucide-react';

interface PublicLandingProps {
  onEnter: () => void;
  onRegister: () => void;
}

const FREE_FEATURES = [
  'Animais cadastrados',
  'Pesagens e GMD automático',
  'Registro de atividades',
  'Manejo do rebanho completo',
  'Lotes e pastos',
  'Sem cartão de crédito',
  'Entrada de lote',
  'Financeiro completo',
  'Sem prazo para acabar',
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
    desc: 'Você pode começar do zero ou importar sua planilha.',
  },
  {
    n: '03',
    title: 'Comece a enxergar sua operação',
    desc: 'Pesagens, compras, vendas e financeiro no mesmo lugar.',
  },
];

const FAQS = [
  {
    q: 'É realmente de graça?',
    a: 'Sim. O plano gratuito não tem prazo para acabar, não precisa de cartão e não tem limite de animais. Você paga só se quiser recursos avançados, como mais fazendas ou relatórios de exportação.',
  },
  {
    q: 'Funciona no celular?',
    a: 'Sim. O EIXO foi pensado para funcionar em qualquer dispositivo — celular, tablet ou computador. Ideal para quem está no campo.',
  },
  {
    q: 'É difícil de usar?',
    a: 'Não. O sistema foi desenhado para o produtor, não para o TI. Se você usa WhatsApp, você usa o EIXO.',
  },
  {
    q: 'Posso importar minha planilha atual?',
    a: 'Sim. O EIXO aceita qualquer planilha sua. Você não precisa redigitar nada.',
  },
  {
    q: 'Meus dados ficam seguros?',
    a: 'Seus dados ficam armazenados em servidores seguros, em conformidade com a LGPD. Você tem acesso completo ao histórico a qualquer momento.',
  },
  {
    q: 'Quando faz sentido pagar?',
    a: 'Quando você quiser mais fazendas, mais usuários ou exportação de relatórios em Excel e PDF. Você decide na hora certa.',
  },
  {
    q: 'Serve para gado comercial e P.O.?',
    a: 'Sim. O EIXO foi pensado para organizar tanto rebanho comercial quanto animais P.O., respeitando as diferenças de registro, genealogia, reprodução e seleção.',
  },
];

const PublicLanding: React.FC<PublicLandingProps> = ({ onEnter, onRegister }) => {
  const [activeFaq, setActiveFaq] = React.useState<number | null>(null);
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
  };

  const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--eixo-green)] px-6 py-3 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]';
  const btnSecondary = 'inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-3 text-sm font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-bg)]';

  return (
    <div className="min-h-screen bg-[var(--eixo-bg)] text-[var(--eixo-text)]">

      {/* ── Nav ── */}
      <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${isScrolled ? 'border-b border-[var(--eixo-border)] bg-[var(--eixo-bg)]/95 shadow-sm backdrop-blur' : 'bg-[rgba(247,248,246,0.58)] backdrop-blur-[2px]'}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:h-18 lg:px-8">
          <div className="inline-flex flex-col items-center leading-none">
            <img src="/logo_eixo_3d_transparent.png" alt="eixo" className="h-[2.53575rem] w-auto" />
            <div className="-mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] whitespace-nowrap text-[var(--eixo-text)]/75">
              Tecnologia para Gestão Pecuária
            </div>
          </div>
          <nav className="hidden items-center gap-7 lg:flex">
            {[
              { label: 'Plano Grátis', action: () => scrollTo('gratis') },
              { label: 'Como funciona', action: () => scrollTo('como') },
              { label: 'Dúvidas', action: () => scrollTo('faq') },
              { label: 'Planos', action: () => { window.location.href = '/planos'; } },
            ].map((item) => (
              <button key={item.label} type="button" onClick={item.action} className="text-sm font-medium text-[var(--eixo-graphite)]/88 transition-colors hover:text-[var(--eixo-text)]">{item.label}</button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onEnter} className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-[var(--eixo-graphite)]/88 transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)] sm:inline-flex">
              Entrar
            </button>
            <button type="button" onClick={onRegister} className={btnPrimary}>
              Começar grátis
            </button>
          </div>
        </div>
      </header>

      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden pb-20 pt-28 lg:pt-36 lg:pb-28">
          <div
            className="absolute inset-0 opacity-08"
            style={{ backgroundImage: "url('/pasture-horizon.jpg')", backgroundPosition: 'center', backgroundSize: 'cover' }}
          />
          <div className="absolute inset-0 bg-[rgba(255,250,241,0.58)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--eixo-surface)]/90 via-[var(--eixo-bg)]/96 to-[var(--eixo-bg)]" />

          <div className="relative mx-auto max-w-5xl px-4 text-center lg:px-8">

            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
              100% GRATUITO PARA COMEÇAR
            </div>

            <h1 className="font-brand text-balance text-4xl font-extrabold leading-tight text-[var(--eixo-text)] lg:text-6xl">
              Chega de caderno e planilha.<br />
              <span className="text-[var(--eixo-text)]">Organize sua fazenda com controle.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[var(--eixo-text-muted)] lg:text-xl">
              Cadastre sua fazenda, organize o rebanho, registre pesagens e acompanhe compras, vendas e financeiro em uma plataforma simples para pecuária de corte.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button type="button" onClick={onRegister} className={`${btnPrimary} h-12 px-8 text-base`}>
                Cadastrar minha fazenda grátis
                <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => scrollTo('como')} className={`${btnSecondary} h-12 px-8 text-base`}>
                Ver como funciona
              </button>
            </div>
            {/* Mini prova social */}
            <div className="mx-auto mt-12 grid max-w-xl grid-cols-3 gap-4 border-t border-[var(--eixo-border)]/80 pt-10">
              {[['R$ 0', 'para começar'], ['Sem cartão', 'para criar sua conta'], ['2 min', 'para cadastrar sua fazenda']].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-[var(--eixo-border)]/70 bg-[rgba(255,250,241,0.42)] px-3 py-4 text-center shadow-[0_10px_24px_rgba(47,58,45,0.06)] backdrop-blur-[1px]">
                  <p className="font-brand text-3xl font-extrabold leading-none text-[var(--eixo-text)] [text-shadow:0_1px_0_rgba(255,250,241,0.3)]">{value}</p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-[var(--eixo-text)]/72">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── O que é grátis ── */}
        <section id="gratis" className="bg-[var(--eixo-surface)] py-20 lg:py-28">
          <div className="mx-auto max-w-5xl px-4 lg:px-8">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                Plano gratuito
              </div>
              <h2 className="font-brand text-3xl font-extrabold text-[var(--eixo-text)] lg:text-4xl">
                O básico da gestão pecuária, liberado no Plano Grátis.
              </h2>
              <p className="mt-4 text-lg text-[var(--eixo-text-muted)]">
                Comece organizando sua operação desde o primeiro dia, sem custo e sem cartão.
              </p>
            </div>

            <div className="rounded-3xl border-2 border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-8 shadow-sm lg:p-12">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {FREE_FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--eixo-surface-soft)]">
                      <CheckCircle2 className="h-4 w-4 text-[var(--eixo-text)]" />
                    </div>
                    <span className="text-sm font-medium text-[var(--eixo-text)]">{f}</span>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-col items-center gap-3 border-t border-[var(--eixo-border)] pt-8 sm:flex-row sm:justify-between">
                <div>
                  <p className="text-2xl font-extrabold text-[var(--eixo-text)]">R$ 0 / mês</p>
                  <p className="text-sm text-[var(--eixo-text-muted)]">Para sempre. Sem cartão.</p>
                </div>
                <button type="button" onClick={onRegister} className={`${btnPrimary} h-12 px-8`}>
                  Cadastrar minha fazenda grátis
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Antes e depois ── */}
        <section className="bg-[var(--eixo-surface-soft)]/80 py-20 lg:py-28">
          <div className="mx-auto max-w-5xl px-4 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="font-brand text-3xl font-extrabold text-[var(--eixo-text)] lg:text-4xl">
                Você já anota. O EIXO transforma em gestão.
              </h2>
              <p className="mx-auto mt-4 max-w-3xl text-lg text-[var(--eixo-text-muted)]">
                A rotina da fazenda já gera informação todos os dias. O EIXO coloca esses dados em ordem para ajudar na gestão.
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Antes — caderno amassado */}
              <div className="relative" style={{ perspective: '600px' }}>
                {/* Folha 1 — mais ao fundo */}
                <div
                  className="absolute inset-x-2 bottom-0 h-full overflow-hidden rounded-2xl"
                  style={{ background: '#eef1e7', transform: 'rotate(2.5deg) translateY(4px)', zIndex: 0 }}
                >
                  <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.15rem', color: 'var(--eixo-graphite)', opacity: 0.28, filter: 'blur(2.5px)', padding: '52px 56px 0 56px', lineHeight: '28px' }}>
                    <p style={{ transform: 'rotate(-0.5deg)' }}>vacina aftosa — 340 cab</p>
                    <p style={{ transform: 'rotate(0.3deg)', marginTop: 28 }}>custo ração jun: R$ 18.400</p>
                    <p style={{ transform: 'rotate(-0.4deg)', marginTop: 28 }}>pasto C vazio — lotar?</p>
                    <p style={{ transform: 'rotate(0.6deg)', marginTop: 28 }}>liga pro João sobre venda</p>
                    <p style={{ transform: 'rotate(-0.2deg)', marginTop: 28 }}>conferir peso lote 7</p>
                  </div>
                </div>

                {/* Folha 2 — intermediária */}
                <div
                  className="absolute inset-x-1 bottom-0 h-full overflow-hidden rounded-2xl"
                  style={{ background: '#f3f5f1', transform: 'rotate(-1.5deg) translateY(2px)', zIndex: 1 }}
                >
                  <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.15rem', color: 'var(--eixo-graphite)', opacity: 0.32, filter: 'blur(1.8px)', padding: '52px 52px 0 52px', lineHeight: '28px' }}>
                    <p style={{ transform: 'rotate(0.4deg)' }}>boi gordo @ R$ 312 arr.</p>
                    <p style={{ transform: 'rotate(-0.5deg)', marginTop: 28 }}>lote 14 — GMD caindo</p>
                    <p style={{ transform: 'rotate(0.3deg)', marginTop: 28 }}>remédio pra brucelose</p>
                    <p style={{ transform: 'rotate(-0.3deg)', marginTop: 28 }}>contar novilhas fazenda 2</p>
                    <p style={{ transform: 'rotate(0.5deg)', marginTop: 28 }}>NF da ração — guardar</p>
                  </div>
                </div>

                {/* Folha principal */}
                <div
                  className="relative overflow-hidden rounded-2xl px-6 pb-6 pt-5"
                  style={{
                    zIndex: 2,
                    background: '#f7f8f6',
                    backgroundImage: `
                      repeating-linear-gradient(transparent, transparent 27px, #d0d8d0 27px, #d0d8d0 28px),
                      linear-gradient(to right, transparent 42px, #c7cec7 42px, #c7cec7 44px, transparent 44px)
                    `,
                    transform: 'rotate(-1.2deg)',
                    boxShadow: '3px 4px 12px rgba(0,0,0,0.18), -2px -1px 6px rgba(0,0,0,0.08)',
                    fontFamily: "'Caveat', 'Patrick Hand', 'Comic Sans MS', cursive",
                  }}
                >
                  {/* Furos de fichário */}
                  <div className="absolute left-0 top-0 flex h-full flex-col justify-around py-6 pl-1.5">
                    {[0,1,2,3].map(i => (
                      <div key={i} className="h-4 w-4 rounded-full bg-[var(--eixo-surface-soft)] shadow-inner" style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)' }} />
                    ))}
                  </div>

                  {/* Mancha de café */}
                  <div className="pointer-events-none absolute right-8 top-4 h-14 w-14 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #8B4513 30%, transparent 70%)' }} />
                  {/* Mancha menor */}
                  <div className="pointer-events-none absolute bottom-10 left-14 h-7 w-7 rounded-full opacity-8" style={{ background: 'radial-gradient(circle, #6B4226 40%, transparent 70%)', opacity: 0.07 }} />

                  {/* Label */}
                  <p className="mb-3 pl-10 text-xs font-bold uppercase tracking-[0.16em] text-[var(--eixo-text-soft)]" style={{ fontFamily: 'inherit' }}>
                    Sem sistema
                  </p>

                  {/* Linhas de caderno */}
                  <div className="space-y-1 pl-14 pr-2" style={{ fontFamily: 'inherit' }}>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(-0.3deg)', color: 'var(--eixo-graphite)' }}>
                      Lote 14 - 247 cab - pesagem 12/03
                    </p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(0.4deg)', color: '#1e3f72' }}>
                      comprou ração 15t ontem
                    </p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(-0.2deg)', color: 'var(--eixo-graphite)' }}>
                      morreu 2 no pasto B-08 <span style={{ color: '#c0392b' }}>(!)</span>
                    </p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(0.5deg)', color: '#1e3f72' }}>
                      santa rita precisa vacinar
                    </p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(-0.4deg)', color: 'var(--eixo-graphite)' }}>
                      vender lote A? preço tá ruim...
                    </p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(0.2deg)', color: '#2a4a80' }}>
                      peso médio caiu? conferir amanhã
                    </p>
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
        <section id="como" className="bg-[var(--eixo-surface)] py-20 lg:py-28">
          <div className="mx-auto max-w-5xl px-4 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="font-brand text-3xl font-extrabold text-[var(--eixo-text)] lg:text-4xl">Como começar</h2>
              <p className="mt-4 text-lg text-[var(--eixo-text-muted)]">Três passos. Menos de 10 minutos.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.n} className="rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-bg)] p-8">
                  <div className="font-brand mb-4 text-5xl font-extrabold text-[var(--eixo-border)]">{step.n}</div>
                  <h3 className="text-lg font-bold text-[var(--eixo-text)]">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--eixo-text-muted)]">{step.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <button type="button" onClick={onRegister} className={`${btnPrimary} h-12 px-8`}>
                Cadastrar minha fazenda grátis
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
                    <button
                      type="button"
                      onClick={() => setActiveFaq(open ? null : i)}
                      className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
                    >
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
        <section className="bg-[var(--eixo-text)] py-20 lg:py-28">
          <div className="mx-auto max-w-3xl px-4 text-center lg:px-8">
            <h2 className="font-brand text-balance text-3xl font-extrabold text-[#f5f0e8] lg:text-5xl">
              Sua fazenda merece mais que caderno.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[var(--eixo-text-soft)]">
              Comece grátis e organize rebanho, pesagens, compras, vendas e financeiro em um só lugar.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button type="button" onClick={onRegister} className="inline-flex items-center gap-2 rounded-xl bg-[var(--eixo-surface)] px-8 py-4 text-base font-bold text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-surface-soft)]">
                Cadastrar minha fazenda grátis
                <ArrowRight className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => { window.location.href = '/planos'; }} className="inline-flex items-center gap-2 rounded-xl border border-[var(--eixo-border-strong)] px-8 py-4 text-base font-semibold text-[var(--eixo-text-soft)] transition-colors hover:border-[var(--eixo-border)] hover:text-white">
                Ver planos
              </button>
            </div>
            <p className="mt-4 text-sm text-[#57534e]">Sem cartão · Sem prazo · Animais ilimitados</p>
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
      <div className="fixed bottom-4 left-4 right-4 z-40 sm:hidden">
        <button
          type="button"
          onClick={onRegister}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--eixo-green)] px-5 py-4 font-bold text-[#1a1a1a] shadow-lg hover:bg-[var(--eixo-green-dark)]"
        >
          Criar conta grátis — é de graça
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default PublicLanding;
