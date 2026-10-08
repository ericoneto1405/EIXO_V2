import React, { useEffect, useState } from 'react';
import { fetchMatrixManagement, WorkflowRecord } from '../adapters/reproWorkflowApi';

const ReproMatrixManagement: React.FC<{ farmId: string; animalId: string }> = ({ farmId, animalId }) => {
    const [records, setRecords] = useState<(WorkflowRecord & { reversao: WorkflowRecord | null })[] | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        fetchMatrixManagement(farmId, animalId)
            .then((result) => {
                if (active) setRecords(result.records);
            })
            .catch((e: Error) => {
                if (active) setError(e.message);
            });
        return () => {
            active = false;
        };
    }, [farmId, animalId]);
    return (
        <section className="space-y-3 rounded-2xl border border-(--eixo-border) bg-(--eixo-surface) p-5">
            <h3 className="font-bold">Manejos de IATF desta matriz</h3>
            {error && (
                <p role="alert" className="text-sm text-red-700">
                    {error}
                </p>
            )}
            {!records && !error && <p>Consultando manejos…</p>}
            {records?.length === 0 && (
                <p className="text-sm text-(--eixo-text-muted)">
                    Sem aplicações individuais no fluxo integrado. Registros antigos agregados permanecem no histórico
                    da rodada.
                </p>
            )}
            {records?.map((record) => (
                <article key={record.id} className="space-y-1 rounded-xl border border-(--eixo-border) p-3 text-sm">
                    <p className="font-semibold">
                        {record.kind === 'RETIRAR' ? 'Retirada do protocolo' : 'Manejo realizado'} ·{' '}
                        {new Date(record.data.body.date || record.createdAt).toLocaleString('pt-BR')}
                    </p>
                    <p>
                        {record.data.body.responsavel || 'Responsável registrado'}
                        {record.data.body.motivo ? ` · ${record.data.body.motivo}` : ''}
                    </p>
                    {record.data.body.ocorrencia && <p>{record.data.body.ocorrencia}</p>}
                    {record.data.result.procedimentos?.map(
                        (
                            procedure: {
                                titulo: string;
                                produto?: string;
                                dose?: number;
                                unidade?: string;
                            },
                            index: number,
                        ) => (
                            <p key={index}>
                                {procedure.titulo}
                                {procedure.produto
                                    ? ` · ${procedure.produto} · ${procedure.dose} ${procedure.unidade} nesta fêmea`
                                    : ' · procedimento sem consumo'}
                            </p>
                        ),
                    )}
                    {record.reversao && (
                        <p className="font-semibold text-amber-700">
                            Aplicação revertida · {record.reversao.data.body.motivo}
                        </p>
                    )}
                </article>
            ))}
        </section>
    );
};
export default ReproMatrixManagement;
