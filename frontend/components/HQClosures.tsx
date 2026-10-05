import React from 'react';
import { getHQClosure, HQClosureError, HQClosureRequest, listHQClosures } from '../adapters/hqClosuresApi';

const button = 'rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-[#1a1a1a] disabled:opacity-50';
const field = 'w-full rounded-xl border border-[#D7D7D7] bg-white px-3 py-2 text-sm text-[#2F2F2F]';
const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : 'Não informado';
const typeLabel = (value: string) => value === 'LOGIN' ? 'Meu login' : 'Organização';
const statusLabel = (value: string) => value === 'OPEN' ? 'Pedido em análise' : 'Pedido fechado';
const organizationLabel = (request: HQClosureRequest) => request.type === 'LOGIN'
    ? 'Não se aplica ao pedido de login' : request.organization?.name || 'Sem vínculo com organização no registro';

export default function HQClosures({ refreshKey }: { refreshKey: number }) {
    const [search, setSearch] = React.useState('');
    const [filters, setFilters] = React.useState({ search: '', type: 'ALL', status: 'OPEN', page: 1 });
    const [retry, setRetry] = React.useState(0);
    const [requests, setRequests] = React.useState<HQClosureRequest[]>([]);
    const [hasMore, setHasMore] = React.useState(false);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [selected, setSelected] = React.useState<string | null>(null);
    const [detail, setDetail] = React.useState<HQClosureRequest | null>(null);
    const [detailLoading, setDetailLoading] = React.useState(false);
    const [detailError, setDetailError] = React.useState<string | null>(null);
    const [detailRetry, setDetailRetry] = React.useState(0);
    const denied = React.useRef(false);

    const handleError = React.useCallback((caught: unknown) => {
        const message = caught instanceof Error ? caught.message : 'Erro ao consultar pedidos.';
        if (caught instanceof HQClosureError && [401, 403].includes(caught.status)) {
            denied.current = true;
            setRequests([]);
            setHasMore(false);
            setSelected(null);
            setDetail(null);
            setError(message);
            setLoading(false);
        }
        return message;
    }, []);

    React.useEffect(() => {
        const controller = new AbortController();
        denied.current = false;
        setRequests([]);
        setHasMore(false);
        setSelected(null);
        setDetail(null);
        setError(null);
        setLoading(true);
        const query = new URLSearchParams({ ...filters, page: String(filters.page) });
        listHQClosures(query, controller.signal).then((payload) => {
            if (controller.signal.aborted || denied.current) return;
            setRequests(payload.requests);
            setHasMore(payload.pagination.hasMore);
        }).catch((caught) => {
            if (!controller.signal.aborted) setError(handleError(caught));
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [filters, retry, refreshKey, handleError]);

    React.useEffect(() => {
        if (!selected) return;
        const controller = new AbortController();
        setDetail(null);
        setDetailError(null);
        setDetailLoading(true);
        getHQClosure(selected, controller.signal).then((payload) => {
            if (!controller.signal.aborted && !denied.current) setDetail(payload.request);
        }).catch((caught) => {
            if (!controller.signal.aborted) setDetailError(handleError(caught));
        }).finally(() => {
            if (!controller.signal.aborted) setDetailLoading(false);
        });
        return () => controller.abort();
    }, [selected, detailRetry, handleError]);

    return <section aria-label="Pedidos de encerramento" className="space-y-4 text-[#2F2F2F]">
        <div className="rounded-2xl border border-[#D7D7D7] bg-white p-4">
            <h2 className="text-lg font-bold">Encerramentos</h2>
            <p className="mt-1 text-sm text-[#5E5E5E]">A exclusão ainda não está disponível nesta etapa.</p>
            <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => {
                event.preventDefault();
                setFilters((current) => ({ ...current, search: search.trim(), page: 1 }));
            }}>
                <label className="text-sm">E-mail ou protocolo
                    <input className={`${field} mt-1`} value={search} maxLength={254} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pedido" />
                </label>
                <label className="text-sm">Tipo
                    <select className={`${field} mt-1`} value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value, page: 1 }))}>
                        <option value="ALL">Todos</option><option value="LOGIN">Meu login</option><option value="ORGANIZATION">Organização</option>
                    </select>
                </label>
                <label className="text-sm">Situação
                    <select className={`${field} mt-1`} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value, page: 1 }))}>
                        <option value="OPEN">Pedido em análise</option><option value="CLOSED">Pedido fechado</option><option value="ALL">Todas</option>
                    </select>
                </label>
                <button className={`${button} self-end`} type="submit">Buscar</button>
            </form>
        </div>
        {loading && <p role="status" className="p-4 text-sm">Carregando pedidos...</p>}
        {error && <div role="alert" className="rounded-2xl border border-[#D7D7D7] bg-white p-4 text-sm">
            <p>{error}</p><button className={`${button} mt-3`} onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>
        </div>}
        {!loading && !error && !selected && <>
            {!requests.length && <p className="rounded-2xl bg-white p-4 text-sm">Nenhum pedido encontrado para os filtros selecionados.</p>}
            <div className="grid gap-3 lg:grid-cols-2">
                {requests.map((request) => <article key={request.protocol} className="min-w-0 rounded-2xl border border-[#D7D7D7] bg-white p-4 text-sm">
                    <p className="break-all font-bold">{request.protocol}</p>
                    <p className="mt-1 break-all">{request.requesterEmail}</p>
                    <p className="mt-2">{typeLabel(request.type)} · {statusLabel(request.status)}</p>
                    <p className="mt-1 wrap-break-word text-[#5E5E5E]">{organizationLabel(request)}</p>
                    <p className="mt-1 text-[#5E5E5E]">Registrado em {date(request.createdAt)}</p>
                    <button className={`${button} mt-3`} aria-expanded={selected === request.protocol} onClick={() => {
                        if (selected === request.protocol) return;
                        setDetail(null); setDetailError(null); setDetailLoading(true); setSelected(request.protocol);
                    }}>Ver detalhes<span className="sr-only"> de {request.protocol}</span></button>
                </article>)}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
                <button className={button} disabled={filters.page === 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Anterior</button>
                <span>Página {filters.page} · até 25 pedidos</span>
                <button className={button} disabled={!hasMore} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Próxima</button>
            </div>
        </>}
        {selected && <section aria-label="Detalhes do pedido" aria-live="polite" className="rounded-2xl border border-[#D7D7D7] bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Detalhes do pedido</h3><button className={button} onClick={() => { setSelected(null); setDetail(null); }}>Voltar à lista</button></div>
            {detailLoading && <p role="status" className="mt-3">Carregando detalhes...</p>}
            {detailError && <div role="alert" className="mt-3"><p>{detailError}</p><button className={`${button} mt-3`} onClick={() => setDetailRetry((value) => value + 1)}>Tentar novamente</button></div>}
            {detail && <dl className="mt-3 space-y-2 wrap-break-word">
                <div><dt className="font-semibold">Protocolo</dt><dd className="break-all">{detail.protocol}</dd></div>
                <div><dt className="font-semibold">E-mail registrado no pedido</dt><dd className="break-all">{detail.requesterEmail}</dd></div>
                <div><dt className="font-semibold">Tipo</dt><dd>{typeLabel(detail.type)}</dd></div>
                <div><dt className="font-semibold">Situação</dt><dd>{statusLabel(detail.status)}</dd></div>
                <div><dt className="font-semibold">Organização</dt><dd>{organizationLabel(detail)}</dd></div>
                <div><dt className="font-semibold">Registrado em</dt><dd>{date(detail.createdAt)}</dd></div>
                {detail.status === 'CLOSED' && <div><dt className="font-semibold">Fechado em</dt><dd>{date(detail.closedAt)}. O fechamento do pedido não comprova exclusão da conta.</dd></div>}
            </dl>}
            <p className="mt-4 text-[#5E5E5E]">A exclusão ainda não está disponível nesta etapa.</p>
        </section>}
    </section>;
}
