import React from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  Dna,
  DollarSign,
  FileCheck,
  Layers,
  Lightbulb,
  RefreshCcw,
  Shield,
  ShieldCheck,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react';

interface PublicLandingProps {
  onEnter: () => void;
  onRegister: () => void;
}

const benefits = [
  {
    icon: RefreshCcw,
    title: 'Menos retrabalho',
    description: 'Centralize operação, histórico e gestão em um único sistema.',
  },
  {
    icon: Building2,
    title: 'Mais controle por fazenda',
    description: 'Veja cada unidade com clareza, sem misturar operação.',
  },
  {
    icon: TrendingUp,
    title: 'Decisão mais segura',
    description: 'Previsibilidade de compra e venda, indicação de descarte e ajustes nutricionais.',
  },
  {
    icon: Layers,
    title: 'Estrutura para crescer',
    description: 'Organize a base agora e evolua depois com mais consistência.',
  },
];

const modules = [
  {
    icon: BarChart3,
    title: 'Produção',
    description: 'Controle de rebanho, lotes, pastos, pesagens e movimentações.',
  },
  {
    icon: Dna,
    title: 'Genética',
    description: 'Plantel P.O., genealogia, seleção e reprodução com histórico.',
  },
  {
    icon: DollarSign,
    title: 'Financeiro',
    description: 'Fluxo de caixa, contas e visão econômica conectada à operação.',
  },
  {
    icon: ShieldCheck,
    title: 'Controle',
    description: 'Controle de acesso, histórico de registros e segurança dos dados da sua operação.',
  },
];

const differentials = [
  'Visão por fazenda e visão consolidada',
  'Rebanho comercial e genética no mesmo ecossistema',
  'Registros com rastreabilidade operacional',
  'Validação antes de impactar os números oficiais',
  'Estrutura pronta para crescer com a operação',
  'Interface profissional, clara e orientada à gestão',
];

const governance = [
  {
    icon: User,
    title: 'Controle de acesso por perfil',
    description: 'Defina quem pode registrar, aprovar ou apenas visualizar.',
  },
  {
    icon: Activity,
    title: 'Trilha de atividades',
    description: 'Veja quem fez o quê, quando e em qual contexto.',
  },
  {
    icon: FileCheck,
    title: 'Aprovação de registros',
    description: 'Valide lançamentos antes de consolidar os dados oficiais.',
  },
  {
    icon: Shield,
    title: 'Histórico auditável',
    description: 'Acesso completo ao histórico de alterações e decisões.',
  },
];

const faqs = [
  {
    question: 'É só para fazenda grande?',
    answer: 'Não. O sistema foi pensado para organizar a operação desde cedo.',
  },
  {
    question: 'Serve para mais de uma fazenda?',
    answer: 'Sim. É possível operar por fazenda ou com visão consolidada.',
  },
  {
    question: 'Atende comercial e P.O.?',
    answer: 'Sim. O EIXO foi desenhado para os dois cenários.',
  },
  {
    question: 'Preciso mudar toda minha rotina?',
    answer: 'Não. A proposta é organizar a operação sem complicar o dia a dia.',
  },
  {
    question: 'Os registros podem ser validados antes de fechar os números?',
    answer: 'Sim. O sistema suporta governança sobre os lançamentos.',
  },
  {
    question: 'Quanto custa?',
    answer: 'Você começa grátis, sem cartão. Quando quiser mais recursos, os planos são acessíveis e você escolhe o momento certo para evoluir.',
  },
  {
    question: 'Funciona no celular?',
    answer: 'Sim. O EIXO foi pensado para funcionar em qualquer dispositivo, inclusive no campo.',
  },
  {
    question: 'Meus dados ficam seguros?',
    answer: 'Sim. Seus dados são armazenados em servidores de alto desempenho, com acesso completo ao histórico a qualquer momento. O EIXO opera em conformidade com a Lei Geral de Proteção de Dados (LGPD).',
  },
  {
    question: 'Preciso de internet para usar?',
    answer: 'A conexão é necessária para sincronizar os dados. Recomendamos uso com internet para garantir que tudo fique atualizado.',
  },
];

const navItems = [
  { label: 'Benefícios', target: 'beneficios' },
  { label: 'Módulos', target: 'modulos' },
  { label: 'Controle', target: 'governanca' },
  { label: 'Perguntas frequentes', target: 'perguntas' },
];

const PublicLanding: React.FC<PublicLandingProps> = ({ onEnter, onRegister }) => {
  const [activeFaq, setActiveFaq] = React.useState<number | null>(0);
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    const offset = 88;
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  const ctaButton =
    'inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold transition-all';

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          isScrolled ? 'border-b border-stone-200 bg-stone-50/95 shadow-sm backdrop-blur' : 'bg-stone-50/80 backdrop-blur'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:h-20 lg:px-8">
          <div>
            <div>
              <div className="text-[2rem] font-black leading-none text-stone-900">eixo</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Plataforma de Gestão Pecuária</div>
            </div>
          </div>

          <nav className="hidden items-center gap-6 lg:flex">
            {navItems.map((item) => (
              <button
                key={item.target}
                type="button"
                onClick={() => scrollToSection(item.target)}
                className="text-sm text-stone-600 transition-colors hover:text-stone-900"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onEnter}
              className="hidden rounded-xl px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 sm:inline-flex"
            >
              Já tenho conta
            </button>
            <button
              type="button"
              onClick={onRegister}
              className={`${ctaButton} bg-primary text-white hover:bg-primary-dark`}
            >
              Criar conta grátis
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden pb-20 pt-32 lg:pb-24 lg:pt-40">
          <div
            className="absolute inset-0 opacity-45"
            style={{
              backgroundImage: "url('/pasture-horizon.jpg')",
              backgroundPosition: 'center -160px',
              backgroundSize: 'cover',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-50 via-stone-50/75 to-stone-50/45" />

          <div className="relative mx-auto max-w-7xl px-4 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-100/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Gestão Pecuária com Controle Real
              </div>
              <h1 className="font-brand text-balance text-4xl font-extrabold leading-tight text-stone-900 lg:text-6xl">
                Mais controle na fazenda.
                <br />
                Mais clareza na gestão.
                <br />
                Mais segurança para decidir.
              </h1>
              <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-stone-600 lg:text-xl">
                O EIXO reúne produção, genética e financeiro em um fluxo único de gestão, com visão por fazenda,
                histórico confiável e estrutura para apoiar decisões do dia a dia.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <button type="button" onClick={onRegister} className={`${ctaButton} bg-primary text-white hover:bg-primary-dark`}>
                  Criar conta grátis
                </button>
                <button
                  type="button"
                  onClick={onEnter}
                  className={`${ctaButton} border border-stone-300 bg-white text-stone-800 hover:border-stone-400 hover:bg-stone-100`}
                >
                  Já tenho conta
                </button>
              </div>

              <div className="mx-auto mt-12 grid max-w-2xl grid-cols-2 gap-4 border-b border-stone-200 pb-12 text-sm text-stone-600">
                <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-amber-600" />Controle por fazenda</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-amber-600" />Rebanho comercial e P.O.</div>
                <div className="flex items-center gap-2"><FileCheck className="h-4 w-4 text-amber-600" />Histórico confiável</div>
                <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-amber-600" />Controle dos registros</div>
              </div>

              <div className="mx-auto mt-12 max-w-2xl rounded-3xl border border-amber-300/30 bg-white p-6 text-left shadow-sm">
                <div className="mb-4 flex items-start gap-3">
                  <div className="mt-1 rounded-xl bg-primary/10 p-2 text-primary"><Zap className="h-5 w-5" /></div>
                  <div>
                    <h3 className="text-lg font-bold text-stone-900">Grátis para começar</h3>
                    <p className="mt-1 text-sm leading-relaxed text-stone-600">
                      Organize sua primeira fazenda, conheça o sistema na prática e evolua para mais recursos quando fizer sentido.
                    </p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-stone-600">
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Sem limite de animais</li>
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Estrutura inicial de gestão</li>
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Sem cartão para começar</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="mx-auto mb-16 max-w-3xl text-center">
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">Tão simples quanto deveria ser</h2>
              <p className="mt-4 text-lg text-stone-600">Três passos para sair do caderno e ter gestão real na fazenda</p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                {
                  number: '01',
                  icon: CheckCircle2,
                  title: 'Estruture sua fazenda',
                  description: 'Cadastre suas fazendas, lotes e rebanho. O sistema se adapta ao seu modelo: comercial, P.O. ou misto.',
                },
                {
                  number: '02',
                  icon: BarChart3,
                  title: 'Registre o dia a dia',
                  description: 'Lançamentos simples de produção, sanidade, genética e financeiro. Sem complexidade, só o essencial.',
                },
                {
                  number: '03',
                  icon: Lightbulb,
                  title: 'Receba insights',
                  description: 'Histórico organizado, alertas sobre desvios e sugestões de decisão. Dados viram gestão na prática.',
                },
              ].map((step) => (
                <div key={step.number} className="rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
                  <div className="font-brand mb-6 text-5xl font-extrabold text-amber-200">{step.number}</div>
                  <step.icon className="mb-6 h-8 w-8 text-primary" />
                  <h3 className="text-xl font-bold text-stone-900">{step.title}</h3>
                  <p className="mt-3 leading-relaxed text-stone-600">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="beneficios" className="bg-stone-100/70 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">Por que sair do caderno e das planilhas</h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {benefits.map((benefit) => (
                <div key={benefit.title} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-amber-300">
                  <benefit.icon className="mb-4 h-8 w-8 text-amber-600" />
                  <h3 className="text-lg font-bold text-stone-900">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="mb-16 text-center">
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">De dados soltos para decisões claras</h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-600">
                O EIXO organiza o que você já registra e transforma em visão prática, destacando o que precisa de atenção.
              </p>
            </div>
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
              <div>
                <div className="mb-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
                  <Target className="h-5 w-5" /> Sem estrutura
                </div>
                <div className="rounded-3xl border border-stone-200 bg-stone-100/70 p-5 font-mono text-sm text-stone-500 shadow-sm">
                  <p className="opacity-80">Lote 14 - 247 cab - pesagem 12/03</p>
                  <p className="opacity-70">comprou ração 15t ontem</p>
                  <p className="opacity-90">morreu 2 no B-08</p>
                  <p className="opacity-60">santa rita precisa vacinar</p>
                  <p className="opacity-80">vender o lote A? preço baixo...</p>
                  <p className="opacity-70">peso médio caiu? conferir</p>
                </div>
                <p className="mt-4 text-sm italic text-stone-500">Informações espalhadas, sem contexto, sem prioridade.</p>
              </div>
              <div>
                <div className="mb-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                  <BarChart3 className="h-5 w-5" /> Com o EIXO
                </div>
                <div className="rounded-3xl border border-amber-300/40 bg-white p-5 shadow-sm">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
                      <div className="flex gap-3">
                        <TrendingDown className="mt-0.5 h-4 w-4 text-red-500" />
                        <div>
                          <p className="text-sm font-semibold text-stone-900">Lote B-08 com mortalidade acima do esperado</p>
                          <p className="text-xs text-stone-500">2 mortes em 7 dias. Verificar manejo.</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="flex gap-3">
                        <TrendingUp className="mt-0.5 h-4 w-4 text-emerald-600" />
                        <div>
                          <p className="text-sm font-semibold text-stone-900">Lote A-14 em condição de venda</p>
                          <p className="text-xs text-stone-500">Peso médio 485kg. GMD 1.2kg/dia nos últimos 30 dias.</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <div className="flex gap-3">
                        <Lightbulb className="mt-0.5 h-4 w-4 text-amber-600" />
                        <div>
                          <p className="text-sm font-semibold text-stone-900">Custo de ração subiu 12% no mês</p>
                          <p className="text-xs text-stone-500">Sugestão: revisar dieta e fornecedores da unidade Santa Rita.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-100/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Realidade do Campo
              </div>
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">
                Da fazenda ao indicador, com mais controle e menos ruído.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-stone-600">
                O EIXO entende a rotina real da pecuária. Cada movimento da operação, cada lote, cada decisão fica registrada com governança e rastreabilidade.
              </p>
              <div className="mt-8 space-y-4">
                {[
                  ['Manejo contínuo registrado', 'Toda atividade com data, hora, responsável e aprovação.'],
                  ['Histórico confiável do rebanho', 'Genealogia, desempenho e histórico comercial em um lugar.'],
                  ['Decisões baseadas em dados reais', 'Indicadores em tempo real conectados à operação.'],
                ].map(([title, description]) => (
                  <div key={title} className="flex gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100"><span className="h-2 w-2 rounded-full bg-amber-500" /></div>
                    <div>
                      <h3 className="font-semibold text-stone-900">{title}</h3>
                      <p className="mt-1 text-sm text-stone-600">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">O EIXO foi pensado para a rotina real da pecuária</h2>
              <p className="mt-4 text-lg text-stone-600">Não é vitrine vazia. É estrutura de gestão.</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-stone-200 bg-white p-8 shadow-sm lg:col-span-2">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-stone-900">Visão Consolidada</h3>
                    <p className="text-sm text-stone-500">Todas as fazendas em um único painel</p>
                  </div>
                  <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Dashboard</div>
                </div>
                <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                  {[
                    ['Rebanho Total', '6.284'],
                    ['Fazendas Ativas', '4'],
                    ['Peso Médio', '492kg'],
                    ['Taxa de Lotação', '2.1 UA/ha'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-stone-500">{label}</p>
                      <p className="text-2xl font-bold text-stone-900">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex h-32 items-end gap-2 rounded-2xl bg-stone-100 p-4">
                  {[40, 65, 85, 55, 95, 75].map((height, index) => (
                    <div key={index} className="w-full rounded-t bg-amber-500/70" style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
              {modules.map((module) => (
                <div key={module.title} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
                  <module.icon className="mb-4 h-8 w-8 text-amber-600" />
                  <h3 className="text-lg font-bold text-stone-900">{module.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{module.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="modulos" className="bg-stone-100/70 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">Módulos que conversam entre si</h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {modules.map((module) => (
                <div key={module.title} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-amber-300">
                  <div className="mb-4 inline-flex rounded-2xl bg-amber-100 p-3">
                    <module.icon className="h-6 w-6 text-amber-700" />
                  </div>
                  <h3 className="font-brand text-xl font-extrabold text-stone-900">{module.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-stone-600">{module.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">O que torna o EIXO mais confiável na prática</h2>
            </div>
            <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2">
              {differentials.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                  <span className="text-sm leading-relaxed text-stone-700">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="governanca" className="bg-stone-100/70 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="mx-auto mb-6 max-w-3xl text-center">
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">Controle para reduzir erro e dar mais segurança</h2>
              <p className="mt-4 text-lg leading-relaxed text-stone-600">
                O problema não é apenas registrar. É confiar no que foi registrado. O EIXO organiza a operação com regras, rastreabilidade e validação.
              </p>
            </div>
            <div className="mx-auto mb-8 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {governance.map((item) => (
                <div key={item.title} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
                  <item.icon className="mb-3 h-8 w-8 text-amber-600" />
                  <h3 className="text-base font-bold text-stone-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="perguntas" className="py-16 lg:py-24">
          <div className="mx-auto max-w-4xl px-4 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="font-brand text-3xl font-extrabold text-stone-900 lg:text-4xl">Perguntas que travam a decisão</h2>
            </div>
            <div className="space-y-4">
              {faqs.map((faq, index) => {
                const isOpen = activeFaq === index;
                return (
                  <div key={faq.question} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => setActiveFaq(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                    >
                      <span className="font-semibold text-stone-900">{faq.question}</span>
                      <ChevronDown className={`h-5 w-5 flex-shrink-0 text-stone-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && <div className="px-6 pb-5 text-sm leading-relaxed text-stone-600">{faq.answer}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-amber-50 py-16 lg:py-24">
          <div className="mx-auto max-w-5xl px-4 text-center lg:px-8">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Próximo passo
            </div>
            <h2 className="font-brand text-balance text-3xl font-extrabold text-stone-900 lg:text-5xl">
              Coloque a operação da fazenda em um sistema feito para gestão, não para improviso.
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-stone-600">
              Crie sua conta grátis, sem limite de animais. Não precisa de cartão para começar.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button type="button" onClick={onRegister} className={`${ctaButton} bg-primary text-white hover:bg-primary-dark`}>
                Criar conta grátis
              </button>
              <button
                type="button"
                onClick={onEnter}
                className={`${ctaButton} border border-stone-300 bg-white text-stone-800 hover:border-stone-400 hover:bg-stone-100`}
              >
                Já tenho conta
              </button>
            </div>
            <div className="mt-6 text-xs text-stone-500">Sem cartão para começar</div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-sm text-stone-500 md:flex-row lg:px-8">
          <p>Grupo Eixo • Plataforma de gestão pecuária orientada por dados</p>
          <div className="flex items-center gap-6">
            <a href="#" className="transition-colors hover:text-stone-900">Termos</a>
            <a href="#" className="transition-colors hover:text-stone-900">Privacidade</a>
            <a href="#" className="transition-colors hover:text-stone-900">Contato</a>
          </div>
        </div>
      </footer>

      <div className="fixed bottom-4 left-4 right-4 z-40 sm:hidden">
        <button type="button" onClick={onRegister} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 font-semibold text-white shadow-lg">
          Criar conta grátis
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default PublicLanding;
