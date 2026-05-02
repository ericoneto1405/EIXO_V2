import React from 'react';
import Marquee from 'react-fast-marquee';
import { Alert } from '../types';

const AlertIcon: React.FC<{ type: Alert['type'] }> = ({ type }) => {
    switch (type) {
        case 'critical':
            return <span className="mr-2 text-[var(--eixo-danger)]">🔴</span>;
        case 'warning':
            return <span className="mr-2 text-[var(--eixo-warning)]">🟡</span>;
        case 'info':
        default:
            return <span className="mr-2 text-[var(--eixo-info)]">🔵</span>;
    }
};

const AlertTicker: React.FC = () => {
    const alerts: Alert[] = [];

    if (alerts.length === 0) {
        return (
            <div className="hidden lg:flex items-center w-full bg-[var(--eixo-surface-soft)] dark:bg-[var(--eixo-graphite)] rounded-lg p-2 overflow-hidden">
                <p className="text-sm text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)] px-2">Nenhum alerta no momento.</p>
            </div>
        );
    }

    return (
        <div className="hidden lg:flex items-center w-full bg-[var(--eixo-surface-soft)] dark:bg-[var(--eixo-graphite)] rounded-lg p-2 overflow-hidden">
            <Marquee
                gradient={true}
                gradientWidth={20}
                speed={40}
                pauseOnHover={true}
                className="text-sm text-[var(--eixo-text)] dark:text-[var(--eixo-text-soft)]"
            >
                {alerts.map(alert => (
                    <div key={alert.id} className="flex items-center mx-8 whitespace-nowrap">
                        <AlertIcon type={alert.type} />
                        <span className="uppercase">{alert.message}</span>
                    </div>
                ))}
            </Marquee>
        </div>
    );
};

export default AlertTicker;
