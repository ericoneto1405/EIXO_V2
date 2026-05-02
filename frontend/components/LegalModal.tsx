import React from 'react';

// ─── Tipos e conteúdo ──────────────────────────────────────────────────────────
export type LegalDoc = 'terms' | 'privacy' | 'cookies';

export const LEGAL_CONTENT: Record<LegalDoc, { title: string; body: string }> = {
    terms: {
        title: 'Termos de Uso',
        body: `Ao criar uma conta no EIXO Sistema de Gestão, você concorda com as regras abaixo.

O EIXO é uma plataforma de gestão para pecuária de corte. O acesso é pessoal e intransferível — cada usuário deve ter seu próprio login.

Você se compromete a usar o sistema apenas para fins legítimos de gestão rural. São proibidos: uso fraudulento, acesso a dados de outros usuários, revenda do sistema sem autorização e inserção de dados falsos.

Os dados inseridos por você (animais, fazendas, lotes, pesagens etc.) pertencem a você. O EIXO os utiliza exclusivamente para entregar o serviço contratado.

O EIXO poderá suspender contas que violem estes Termos. Você pode encerrar sua conta a qualquer momento nas configurações.

Os planos pagos têm garantia de reembolso de 7 dias a partir da primeira cobrança. Cancelamentos entram em vigor ao final do período já pago.

Estes Termos são regidos pela legislação brasileira, incluindo o Código de Defesa do Consumidor (Lei nº 8.078/1990).`,
    },
    privacy: {
        title: 'Política de Privacidade',
        body: `Esta Política descreve como o EIXO coleta, usa e protege seus dados, em conformidade com a LGPD (Lei nº 13.709/2018).

DADOS QUE COLETAMOS
Fornecidos por você: nome, e-mail, telefone, senha, dados da fazenda e do rebanho.
Coletados automaticamente: IP, tipo de dispositivo, páginas acessadas e cookies.

COMO USAMOS SEUS DADOS
— Criar e gerenciar sua conta (execução de contrato)
— Processar pagamentos via Asaas (execução de contrato)
— Melhorar a plataforma (legítimo interesse)
— Enviar comunicações de marketing apenas com seu consentimento

COM QUEM COMPARTILHAMOS
Seus dados não são vendidos. Podemos compartilhá-los com: Asaas (pagamentos), provedores de nuvem (hospedagem) e autoridades quando exigido por lei.

SEUS DIREITOS
Você pode acessar, corrigir ou excluir seus dados a qualquer momento. Para exercer seus direitos, envie e-mail para privacidade@eixo.app. Responderemos em até 15 dias úteis.

SEGURANÇA
Utilizamos criptografia, controle de acesso e monitoramento contínuo para proteger seus dados.`,
    },
    cookies: {
        title: 'Política de Cookies',
        body: `Cookies são pequenos arquivos que o EIXO armazena no seu navegador para melhorar sua experiência.

TIPOS DE COOKIES
— Essenciais: mantêm sua sessão ativa e garantem segurança. Não podem ser desativados.
— Funcionais: lembram suas preferências. Podem ser desativados.
— Analíticos: entendem como você usa a plataforma. Podem ser desativados.
— Marketing: personalizam comunicações. Apenas com seu consentimento.

COMO GERENCIAR
Você pode controlar os cookies nas configurações do seu navegador (Chrome, Safari, Firefox ou Edge) em Privacidade ou Cookies.

Ao acessar o EIXO pela primeira vez, você verá um aviso para aceitar ou personalizar suas preferências de cookies.`,
    },
};

// ─── Componente ───────────────────────────────────────────────────────────────
interface LegalModalProps {
    doc: LegalDoc;
    onClose: () => void;
}

const LegalModal: React.FC<LegalModalProps> = ({ doc, onClose }) => {
    const content = LEGAL_CONTENT[doc];
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-lg rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-4">
                    <h3 className="text-base font-bold text-[var(--eixo-text)]">{content.title}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-green)]"
                        aria-label="Fechar"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                {/* Corpo */}
                <div className="max-h-[55vh] overflow-y-auto px-6 py-5">
                    {content.body.split('\n\n').map((paragraph, i) => (
                        <p
                            key={i}
                            className={`text-sm leading-relaxed text-[var(--eixo-text-muted)] ${i > 0 ? 'mt-4' : ''} ${
                                paragraph === paragraph.toUpperCase() && paragraph.length < 40
                                    ? 'font-semibold text-[var(--eixo-text)]'
                                    : ''
                            }`}
                        >
                            {paragraph}
                        </p>
                    ))}
                </div>
                {/* Footer */}
                <div className="border-t border-[var(--eixo-border)] px-6 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full rounded-2xl bg-[var(--eixo-green)] py-2.5 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LegalModal;
