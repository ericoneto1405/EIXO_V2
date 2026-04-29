
import React from 'react';
import { Tarefa } from '../types';
import ChartCard from './ChartCard';

const TaskList: React.FC = () => {
    const tasks: Tarefa[] = [];

    return (
        <ChartCard title="Tarefas Pendentes">
            {tasks.length === 0 ? (
                <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma tarefa cadastrada ainda.</p>
            ) : (
                <div className="space-y-3">
                    {tasks.map(task => (
                        <div key={task.id} className="flex items-center rounded-xl p-2 hover:bg-[var(--eixo-surface-soft)]">
                            <input
                                type="checkbox"
                                checked={task.concluida}
                                readOnly
                                className={`h-5 w-5 rounded border-[var(--eixo-border)] text-[var(--eixo-green)] focus:ring-[var(--eixo-green)]/10 ${task.concluida ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            />
                            <div className={`ml-4 flex-1 ${task.concluida ? 'line-through text-[#a8a29e]' : ''}`}>
                                <p className="font-medium text-[var(--eixo-text)]">{task.titulo}</p>
                                <p className="text-xs text-[var(--eixo-text-muted)]">
                                    {task.responsavel} - Vence: {task.prazo}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </ChartCard>
    );
};

export default TaskList;
