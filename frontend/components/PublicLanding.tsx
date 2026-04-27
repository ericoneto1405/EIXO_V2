import React from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, TrendingDown, TrendingUp, Lightbulb } from 'lucide-react';

interface PublicLandingProps {
  onEnter: () => void;
  onRegister: () => void;
}

const FREE_FEATURES = [
  'Animais ilimitados',
  'Manejo do rebanho completo',
  'Entrada de lote (vários de uma vez)',
  'Pesagens e GMD automático',
  'Lotes e pastos',
  'Financeiro completo',
  'Registro de atividades',
  'Sem cartão de crédito',
  'Sem prazo para acabar',
];

const STEPS = [
  {
    n: '01',
    title: 'Crie sua conta',
    desc: 'Leva menos de 2 minutos. Sem cartão, sem burocracia.',
  },
  {
    n: '02',
    title: 'Cadastre sua fazenda e rebanho',
    desc: 'Importe uma planilha ou adicione os animais manualmente. O sistema se adapta ao seu jeito.',
  },
  {
    n: '03',
    title: 'Comece a usar no dia a dia',
    desc: 'Pesagens, compras, vendas, financeiro — tudo em um lugar só. Do celular ou computador.',
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

  const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#a8442a] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#933a22]';
  const btnSecondary = 'inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-50';

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">

      {/* ── Nav ── */}
      <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${isScrolled ? 'border-b border-stone-200 bg-stone-50/95 shadow-sm backdrop-blur' : 'bg-transparent'}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:h-18 lg:px-8">
          <div>
            <img src="/logo_eixo_black.svg" alt="eixo" className="h-8 w-auto" />
            <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Gestão Pecuária</div>
          </div>
          <nav className="hidden items-center gap-7 lg:flex">
            {[['O que é grátis', 'gratis'], ['Como funciona', 'como'], ['Perguntas', 'faq']].map(([label, id]) => (
              <button key={id} type="button" onClick={() => scrollTo(id)} className="text-sm text-stone-600 hover:text-stone-900 transition-colors">{label}</button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onEnter} className="hidden rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 sm:inline-flex transition-colors">
              Entrar
            </button>
            <button type="button" onClick={onRegister} className={btnPrimary}>
              Criar conta grátis
            </button>
          </div>
        </div>
      </header>

      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden pb-20 pt-28 lg:pt-36 lg:pb-28">
          <div
            className="absolute inset-0 opacity-40"
            style={{ backgroundImage: "url('/pasture-horizon.jpg')", backgroundPosition: 'center', backgroundSize: 'cover' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-stone-50/60 via-stone-50/80 to-stone-50" />

          <div className="relative mx-auto max-w-5xl px-4 text-center lg:px-8">

            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#f0d5ca] bg-[#faeee8] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#7a2a14]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a8442a]" />
              100% gratuito para começar
            </div>

            <h1 className="font-brand text-balance text-4xl font-extrabold leading-tight text-stone-900 lg:text-6xl">
              Chega de caderno e planilha.<br />
              <span className="text-[#1c1917]">Seu rebanho organizado, de graça.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-stone-600 lg:text-xl">
              Cadastre animais, registre pesagens, controle compras e vendas e veja o financeiro da fazenda — tudo em um sistema simples, sem pagar nada para começar.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button type="button" onClick={onRegister} className={`${btnPrimary} h-12 px-8 text-base`}>
                Criar conta grátis
                <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={onEnter} className={`${btnSecondary} h-12 px-8 text-base`}>
                Já tenho conta
              </button>
            </div>

            <p className="mt-4 text-sm text-stone-500">Sem cartão de crédito · Sem prazo para acabar · Animais ilimitados</p>

            {/* Mini prova social */}
            <div className="mx-auto mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-stone-200 pt-10">
              {[['Ilimitado', 'animais no plano grátis'], ['0', 'reais para começar'], ['2 min', 'para criar sua conta']].map(([value, label]) => (
                <div key={label} className="text-center">
                  <p className="font-brand text-3xl font-extrabold text-[#1c1917]">{value}</p>
                  <p className="mt-1 text-xs text-stone-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── O que é grátis ── */}
        <section id="gratis" className="bg-white py-20 lg:py-28">
          <div className="mx-auto max-w-5xl px-4 lg:px-8">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f0d5ca] bg-[#faeee8] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#7a2a14]">
                Plano gratuito
              </div>
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">
                Tudo isso sem pagar nada.
              </h2>
              <p className="mt-4 text-lg text-stone-600">
                Não é versão de teste. É o sistema completo para você organizar sua operação desde o primeiro dia.
              </p>
            </div>

            <div className="rounded-3xl border-2 border-[#e7e5e4] bg-white p-8 shadow-sm lg:p-12">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {FREE_FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#f5f5f4]">
                      <CheckCircle2 className="h-4 w-4 text-[#1c1917]" />
                    </div>
                    <span className="text-sm font-medium text-stone-800">{f}</span>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-col items-center gap-3 border-t border-[#e7e5e4] pt-8 sm:flex-row sm:justify-between">
                <div>
                  <p className="text-2xl font-extrabold text-stone-900">R$ 0 / mês</p>
                  <p className="text-sm text-stone-500">Para sempre. Sem cartão.</p>
                </div>
                <button type="button" onClick={onRegister} className={`${btnPrimary} h-12 px-8`}>
                  Criar conta grátis agora
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Antes e depois ── */}
        <section className="bg-stone-100/60 py-20 lg:py-28">
          <div className="mx-auto max-w-5xl px-4 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">
                Você já tem as informações. O EIXO organiza.
              </h2>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Antes — caderno amassado */}
              <div className="relative" style={{ perspective: '600px' }}>
                {/* Folha 1 — mais ao fundo */}
                <div
                  className="absolute inset-x-2 bottom-0 h-full overflow-hidden rounded-2xl"
                  style={{ background: '#e8e0c8', transform: 'rotate(2.5deg) translateY(4px)', zIndex: 0 }}
                >
                  <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.15rem', color: '#1a3a6b', opacity: 0.28, filter: 'blur(2.5px)', padding: '52px 56px 0 56px', lineHeight: '28px' }}>
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
                  style={{ background: '#ede6d0', transform: 'rotate(-1.5deg) translateY(2px)', zIndex: 1 }}
                >
                  <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.15rem', color: '#1a3a6b', opacity: 0.32, filter: 'blur(1.8px)', padding: '52px 52px 0 52px', lineHeight: '28px' }}>
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
                    background: '#f7f2e3',
                    backgroundImage: `
                      repeating-linear-gradient(transparent, transparent 27px, #c9bfa6 27px, #c9bfa6 28px),
                      linear-gradient(to right, transparent 42px, #e8a0a0 42px, #e8a0a0 44px, transparent 44px)
                    `,
                    transform: 'rotate(-1.2deg)',
                    boxShadow: '3px 4px 12px rgba(0,0,0,0.18), -2px -1px 6px rgba(0,0,0,0.08)',
                    fontFamily: "'Caveat', 'Patrick Hand', 'Comic Sans MS', cursive",
                  }}
                >
                  {/* Furos de fichário */}
                  <div className="absolute left-0 top-0 flex h-full flex-col justify-around py-6 pl-1.5">
                    {[0,1,2,3].map(i => (
                      <div key={i} className="h-4 w-4 rounded-full bg-stone-100 shadow-inner" style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)' }} />
                    ))}
                  </div>

                  {/* Mancha de café */}
                  <div className="pointer-events-none absolute right-8 top-4 h-14 w-14 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #8B4513 30%, transparent 70%)' }} />
                  {/* Mancha menor */}
                  <div className="pointer-events-none absolute bottom-10 left-14 h-7 w-7 rounded-full opacity-8" style={{ background: 'radial-gradient(circle, #6B4226 40%, transparent 70%)', opacity: 0.07 }} />

                  {/* Label */}
                  <p className="mb-3 pl-10 text-xs font-bold uppercase tracking-[0.16em] text-stone-400" style={{ fontFamily: 'inherit' }}>
                    Sem sistema
                  </p>

                  {/* Linhas de caderno */}
                  <div className="space-y-1 pl-14 pr-2" style={{ fontFamily: 'inherit' }}>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(-0.3deg)', color: '#1a3a6b' }}>
                      Lote 14 - 247 cab - pesagem 12/03
                    </p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(0.4deg)', color: '#1e3f72' }}>
                      comprou ração 15t ontem
                    </p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(-0.2deg)', color: '#1a3a6b' }}>
                      morreu 2 no pasto B-08 <span style={{ color: '#c0392b' }}>(!)</span>
                    </p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(0.5deg)', color: '#1e3f72' }}>
                      santa rita precisa vacinar
                    </p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(-0.4deg)', color: '#1a3a6b' }}>
                      vender lote A? preço tá ruim...
                    </p>
                    <p className="text-xl leading-7" style={{ transform: 'rotate(0.2deg)', color: '#2a4a80' }}>
                      peso médio caiu? conferir amanhã
                    </p>
                  </div>
                </div>
              </div>

              {/* Depois */}
              <div className="rounded-3xl border-2 border-[#e7e5e4] bg-white p-6 shadow-sm">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-[#1c1917]">Com o EIXO</p>
                <div className="space-y-3">
                  <div className="flex gap-3 rounded-2xl border border-[#d9b6a8] bg-[#fbede8] p-3">
                    <TrendingDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#8c4d39]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1c1917]">Mortalidade acima do esperado — Pasto B-08</p>
                      <p className="text-xs text-[#78716c]">2 mortes em 7 dias. Verificar manejo.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-2xl border border-[#b6d4b0] bg-[#edf4eb] p-3">
                    <TrendingUp className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#16a34a]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1c1917]">Lote A-14 pronto para venda</p>
                      <p className="text-xs text-[#78716c]">Peso médio 485 kg · GMD 1,2 kg/dia</p>
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-2xl border border-[#f0d5ca] bg-[#faeee8] p-3">
                    <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#a8442a]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1c1917]">Custo com ração subiu 12% no mês</p>
                      <p className="text-xs text-[#78716c]">Revisar dieta e fornecedores da fazenda Santa Rita.</p>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm text-stone-500 italic">Cada informação no lugar certo, com contexto.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Como funciona ── */}
        <section id="como" className="bg-white py-20 lg:py-28">
          <div className="mx-auto max-w-5xl px-4 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">Como começar</h2>
              <p className="mt-4 text-lg text-stone-600">Três passos. Menos de 10 minutos.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.n} className="rounded-3xl border border-stone-200 bg-stone-50 p-8">
                  <div className="font-brand mb-4 text-5xl font-extrabold text-[#e7e5e4]">{step.n}</div>
                  <h3 className="text-lg font-bold text-stone-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{step.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <button type="button" onClick={onRegister} className={`${btnPrimary} h-12 px-8`}>
                Começar agora — é grátis
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="bg-stone-100/60 py-20 lg:py-28">
          <div className="mx-auto max-w-3xl px-4 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">Perguntas frequentes</h2>
            </div>
            <div className="space-y-3">
              {FAQS.map((faq, i) => {
                const open = activeFaq === i;
                return (
                  <div key={faq.q} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                    <button
                      type="button"
                      onClick={() => setActiveFaq(open ? null : i)}
                      className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
                    >
                      <span className="font-semibold text-stone-900">{faq.q}</span>
                      <ChevronDown className={`h-5 w-5 flex-shrink-0 text-stone-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && (
                      <div className="border-t border-stone-100 px-6 pb-5 pt-4 text-sm leading-relaxed text-stone-600">
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
        <section className="bg-[#1c1917] py-20 lg:py-28">
          <div className="mx-auto max-w-3xl px-4 text-center lg:px-8">
            <h2 className="font-brand text-balance text-3xl font-extrabold text-[#f5f0e8] lg:text-5xl">
              Seu rebanho merece mais que caderno.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[#a8a29e]">
              Comece de graça hoje. Sem cartão, sem prazo, sem limite de animais.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button type="button" onClick={onRegister} className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-[#1c1917] transition-colors hover:bg-[#f5f5f4]">
                Criar conta grátis
                <ArrowRight className="h-5 w-5" />
              </button>
              <button type="button" onClick={onEnter} className="inline-flex items-center gap-2 rounded-xl border border-[#3c3a38] px-8 py-4 text-base font-semibold text-[#a8a29e] transition-colors hover:border-[#57534e] hover:text-white">
                Já tenho conta
              </button>
            </div>
            <p className="mt-4 text-sm text-[#57534e]">Sem cartão · Sem prazo · Animais ilimitados</p>
          </div>
        </section>

      </main>

      <footer className="border-t border-stone-200 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-sm text-stone-500 md:flex-row lg:px-8">
          <p>© 2026 EIXO · Plataforma de gestão pecuária</p>
          <div className="flex items-center gap-6">
            <a href="#" className="transition-colors hover:text-stone-900">Termos</a>
            <a href="#" className="transition-colors hover:text-stone-900">Privacidade</a>
            <a href="#" className="transition-colors hover:text-stone-900">Contato</a>
          </div>
        </div>
      </footer>

      {/* CTA fixo mobile */}
      <div className="fixed bottom-4 left-4 right-4 z-40 sm:hidden">
        <button
          type="button"
          onClick={onRegister}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#a8442a] px-5 py-4 font-bold text-white shadow-lg hover:bg-[#933a22]"
        >
          Criar conta grátis — é de graça
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default PublicLanding;
