import React, { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CommercialAlertsUI, CommercialClientUI } from '../adapters/commercialApi';

export type BuyerGroup = 'recent' | 'inactive' | 'first';

export const BUYER_GROUPS = [
  { key: 'recent' as const, label: 'Compra recente', help: 'Manter o relacionamento · compra há menos de 90 dias', color: 'var(--eixo-success)' },
  { key: 'inactive' as const, label: 'Retomar relacionamento', help: 'Recuperar compradores · 90 dias ou mais sem compra', color: 'var(--eixo-warning)' },
  { key: 'first' as const, label: 'Primeira compra', help: 'Prospectar · sem compra registrada no CRM', color: 'var(--eixo-text-muted)' },
];

export function buyerGroup(clientId: string, alerts: CommercialAlertsUI): BuyerGroup {
  const inactive = alerts.inactiveClients.find((item) => item.client.id === clientId);
  return !inactive ? 'recent' : inactive.lastPurchaseAt ? 'inactive' : 'first';
}

interface Props {
  clients: CommercialClientUI[];
  alerts: CommercialAlertsUI;
  selected: BuyerGroup | null;
  onSelect: (group: BuyerGroup) => void;
}

export default function CommercialBuyersOverview({ clients, alerts, selected, onSelect }: Props) {
  const groups = useMemo(() => BUYER_GROUPS.map((group) => ({ ...group,
    value: clients.filter((client) => buyerGroup(client.id, alerts) === group.key).length,
  })), [clients, alerts]);
  const number = (value: number) => value.toLocaleString('pt-BR');
  return <section aria-labelledby="buyers-overview-title" className="rounded-2xl border border-(--eixo-border) bg-(--eixo-surface) p-5">
    <h2 id="buyers-overview-title" className="font-brand text-lg font-bold text-(--eixo-text)">Compradores da fazenda</h2>
    <p className="mt-1 text-sm text-(--eixo-text-muted)">Relacionamento com frigoríficos, pecuaristas e leilões/corretores. Selecione um grupo para consultar os clientes.</p>
    {!clients.length ? <p className="mt-5 text-sm text-(--eixo-text-muted)">Cadastre o primeiro cliente para acompanhar as oportunidades de compra.</p> : <div className="mt-4 grid items-center gap-4 md:grid-cols-[240px_1fr]">
      <div className="relative h-56" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%"><PieChart>
          <Pie data={groups} dataKey="value" nameKey="label" innerRadius={65} outerRadius={95} isAnimationActive={false}>
            {groups.map((group) => <Cell key={group.key} fill={group.color} />)}
          </Pie>
          <Tooltip formatter={(value) => `${number(Number(value))} clientes`} />
        </PieChart></ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-2xl text-(--eixo-text)">{number(clients.length)}</strong><span className="text-xs text-(--eixo-text-muted)">clientes</span></div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-(--eixo-text)">Total: {number(clients.length)} clientes cadastrados</p>
        {groups.map((group) => <button key={group.key} type="button" aria-pressed={selected === group.key} onClick={() => onSelect(group.key)}
          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--eixo-green) ${selected === group.key ? 'border-(--eixo-green) bg-(--eixo-green-soft)' : 'border-(--eixo-border) hover:bg-(--eixo-surface-soft)'}`}>
          <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-(--eixo-text)">{group.label}</span><span className="block text-xs text-(--eixo-text-muted)">{group.help}</span></span>
          <span className="shrink-0 text-right"><strong className="block text-sm text-(--eixo-text)">{number(group.value)}</strong><span className="text-xs text-(--eixo-text-muted)">{(group.value / clients.length * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span></span>
        </button>)}
      </div>
    </div>}
    <p className="mt-4 text-xs text-(--eixo-text-muted)">Base: negociações marcadas como Ganho nesta fazenda. Sem registro no CRM não significa ausência de vendas fora dele.</p>
  </section>;
}
