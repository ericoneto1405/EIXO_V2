import React, { useState } from 'react';
import { buildApiUrl } from '../api';

// ─── Modal de documento legal ──────────────────────────────────────────────────
type LegalDoc = 'terms' | 'privacy' | 'cookies';

const LEGAL_CONTENT: Record<LegalDoc, { title: string; body: string }> = {
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
                className="relative w-full max-w-lg rounded-3xl border border-[#e7e5e4] bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[#e7e5e4] px-6 py-4">
                    <h3 className="text-base font-bold text-[#1c1917]">{content.title}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-[#78716c] transition-colors hover:bg-[#f5f5f4] hover:text-[#a8442a]"
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
                            className={`text-sm leading-relaxed text-[#78716c] ${i > 0 ? 'mt-4' : ''} ${
                                paragraph === paragraph.toUpperCase() && paragraph.length < 40
                                    ? 'font-semibold text-[#1c1917]'
                                    : ''
                            }`}
                        >
                            {paragraph}
                        </p>
                    ))}
                </div>
                {/* Footer */}
                <div className="border-t border-[#e7e5e4] px-6 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full rounded-2xl bg-[#a8442a] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#933a22]"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
};

interface RegisterProps {
    onSuccess: () => void;
    onBack: () => void;
}

const PASSWORD_POLICY_MESSAGE = 'A senha deve ter pelo menos 8 caracteres, com ao menos 1 letra e 1 número.';

const isPasswordStrongEnough = (value: string) =>
    value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);

// ─── Validação de dígitos ─────────────────────────────────────────────────────
function validateCNPJ(cnpj: string): boolean {
    const n = cnpj.replace(/\D/g, '');
    if (n.length !== 14) return false;
    if (/^(\d)\1+$/.test(n)) return false;
    let sum = 0, weight = 5;
    for (let i = 0; i < 12; i++) { sum += parseInt(n[i]) * weight; weight = weight === 2 ? 9 : weight - 1; }
    const d1 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (parseInt(n[12]) !== d1) return false;
    sum = 0; weight = 6;
    for (let i = 0; i < 13; i++) { sum += parseInt(n[i]) * weight; weight = weight === 2 ? 9 : weight - 1; }
    const d2 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return parseInt(n[13]) === d2;
}

function validateCPF(cpf: string): boolean {
    const n = cpf.replace(/\D/g, '');
    if (n.length !== 11) return false;
    if (/^(\d)\1+$/.test(n)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(n[i]) * (10 - i);
    const d1 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (parseInt(n[9]) !== d1) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(n[i]) * (11 - i);
    const d2 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return parseInt(n[10]) === d2;
}

// ─── Máscaras ─────────────────────────────────────────────────────────────────
function maskCNPJ(value: string): string {
    const n = value.replace(/\D/g, '').slice(0, 14);
    return n
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
}

function maskCPF(value: string): string {
    const n = value.replace(/\D/g, '').slice(0, 11);
    return n
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface CnpjResult {
    razao_social?: string;
    nome_fantasia?: string;
    descricao_situacao_cadastral?: string;
    municipio?: string;
    uf?: string;
    cnae_fiscal_descricao?: string;
    telefone?: string;
    email?: string;
    [key: string]: unknown;
}

// ─── Componente ───────────────────────────────────────────────────────────────
const Register: React.FC<RegisterProps> = ({ onSuccess, onBack }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [openModal, setOpenModal] = useState<LegalDoc | null>(null);

    // Documento
    const [docType, setDocType] = useState<'CNPJ' | 'CPF'>('CNPJ');
    const [docValue, setDocValue] = useState('');
    const [docError, setDocError] = useState<string | null>(null);
    const [cnpjResult, setCnpjResult] = useState<CnpjResult | null>(null);
    const [isCnpjLoading, setIsCnpjLoading] = useState(false);
    const [cpfValid, setCpfValid] = useState(false);

    // Celular + OTP (CPF)
    const [phone, setPhone] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [phoneVerified, setPhoneVerified] = useState(false);
    const [otpError, setOtpError] = useState<string | null>(null);
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

    const docDigits = docValue.replace(/\D/g, '');
    const cnpjIsActive = cnpjResult?.descricao_situacao_cadastral === 'ATIVA';
    const docVerified = docType === 'CNPJ' ? cnpjIsActive : cpfValid;
    const canSubmit = docVerified && phoneVerified && termsAccepted;

    const handleDocTypeChange = (type: 'CNPJ' | 'CPF') => {
        setDocType(type);
        setDocValue('');
        setDocError(null);
        setCnpjResult(null);
        setCpfValid(false);
        setPhone('');
        setOtpCode('');
        setOtpSent(false);
        setPhoneVerified(false);
        setOtpError(null);
    };

    const handleDocInput = (raw: string) => {
        const masked = docType === 'CNPJ' ? maskCNPJ(raw) : maskCPF(raw);
        setDocValue(masked);
        setDocError(null);
        setCnpjResult(null);

        if (docType === 'CPF') {
            const digits = masked.replace(/\D/g, '');
            if (digits.length === 11) {
                if (validateCPF(digits)) {
                    setCpfValid(true);
                } else {
                    setCpfValid(false);
                    setDocError('CPF inválido. Verifique os dígitos.');
                }
            } else {
                setCpfValid(false);
            }
        }
    };

    const maskPhone = (value: string): string => {
        const n = value.replace(/\D/g, '').slice(0, 11);
        return n
            .replace(/^(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2');
    };

    const handlePhoneInput = (raw: string) => {
        setPhone(maskPhone(raw));
        setOtpSent(false);
        setPhoneVerified(false);
        setOtpCode('');
        setOtpError(null);
    };

    const handleSendOtp = async () => {
        setOtpError(null);
        setIsSendingOtp(true);
        try {
            const res = await fetch(buildApiUrl('/auth/send-otp'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setOtpError(data?.message || 'Erro ao enviar SMS.'); return; }
            setOtpSent(true);
            setOtpCode('');
        } catch {
            setOtpError('Não foi possível enviar o SMS. Verifique sua conexão.');
        } finally {
            setIsSendingOtp(false);
        }
    };

    const handleVerifyOtp = async () => {
        setOtpError(null);
        setIsVerifyingOtp(true);
        try {
            const res = await fetch(buildApiUrl('/auth/verify-otp'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, code: otpCode }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setOtpError(data?.message || 'Código inválido.'); return; }
            setPhoneVerified(true);
        } catch {
            setOtpError('Não foi possível verificar o código. Tente novamente.');
        } finally {
            setIsVerifyingOtp(false);
        }
    };

    const handleConsultarCNPJ = async () => {
        setDocError(null);
        setCnpjResult(null);

        if (!validateCNPJ(docDigits)) {
            setDocError('CNPJ inválido. Verifique os dígitos.');
            return;
        }

        setIsCnpjLoading(true);
        try {
            const res = await fetch(buildApiUrl(`/public/cnpj/${docDigits}`));
            const data = await res.json();
            if (!res.ok) {
                setDocError(data?.message || 'CNPJ não encontrado na Receita Federal.');
                return;
            }
            setCnpjResult(data);
        } catch {
            setDocError('Não foi possível consultar a Receita Federal. Verifique sua conexão.');
        } finally {
            setIsCnpjLoading(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (!name.trim() || !email.trim() || !password || !confirmPassword) {
            setError('Preencha nome, e-mail, senha e confirmação de senha.');
            return;
        }
        if (!isPasswordStrongEnough(password)) {
            setError(PASSWORD_POLICY_MESSAGE);
            return;
        }
        if (password !== confirmPassword) {
            setError('A confirmação de senha precisa ser igual à senha.');
            return;
        }
        if (!canSubmit) {
            if (!termsAccepted) {
                setError('Você precisa aceitar os Termos de Uso e a Política de Privacidade para continuar.');
                return;
            }
            setError(docType === 'CNPJ' ? 'Consulte e confirme seu CNPJ antes de continuar.' : 'Informe um CPF válido.');
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch(buildApiUrl('/register'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    email: email.trim(),
                    password,
                    document: docDigits,
                    documentType: docType,
                    cnpjData: cnpjResult || undefined,
                    phone,
                    termsVersion: '1.0',
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(payload?.message || 'Não foi possível criar sua conta.');
                return;
            }
            onSuccess();
        } catch (submitError) {
            console.error(submitError);
            setError('Não foi possível conectar ao servidor.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const inputClass = 'mt-1 w-full rounded-2xl border border-[#e7e5e4] bg-[#f5f5f4] px-4 py-3 text-[#1c1917] focus:outline-none focus:ring-2 focus:ring-[#a8442a]';

    return (
        <div className="min-h-screen bg-stone-50 text-[#1c1917]">
            {openModal && (
                <LegalModal doc={openModal} onClose={() => setOpenModal(null)} />
            )}
            <div className="relative min-h-screen overflow-hidden">
                <div
                    className="absolute inset-0 opacity-40"
                    style={{
                        backgroundImage: "url('/pasture-horizon.jpg')",
                        backgroundPosition: 'center -160px',
                        backgroundSize: 'cover',
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-50 via-stone-50/80 to-stone-50/55" />

                <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-8 lg:px-8">
                    <div className="mb-10">
                        <img src="/logo_eixo_black.svg" alt="eixo" className="h-10 w-auto" />
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[#78716c]">Plataforma de Gestão Pecuária</div>
                    </div>

                    <div className="flex flex-1 items-center justify-center">
                        <div className="w-full max-w-xl rounded-3xl border border-[#e7e5e4] bg-white/95 shadow-xl backdrop-blur">
                            <div className="flex flex-col justify-center p-8 lg:p-10">
                                <div className="mx-auto w-full max-w-md">
                                    <button
                                        type="button"
                                        onClick={onBack}
                                        className="mb-6 inline-flex items-center text-sm font-medium text-[#78716c] transition-colors hover:text-[#a8442a]"
                                    >
                                        ← VOLTAR
                                    </button>
                                    <div className="mb-6">
                                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f0d5ca] bg-[#faeee8] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#7a2a14]">
                                            <span className="h-1.5 w-1.5 rounded-full bg-[#a8442a]" />
                                            Crie sua conta
                                        </div>
                                        <div>
                                            <p className="text-sm uppercase tracking-[0.18em] text-[#78716c]">Plano grátis</p>
                                            <h2 className="mt-2 text-3xl font-black text-[#1c1917]">Comece agora</h2>
                                            <p className="mt-3 text-sm leading-relaxed text-[#78716c]">
                                                Sem cartão para começar. Organize sua fazenda hoje.
                                            </p>
                                        </div>
                                    </div>

                                    <form onSubmit={handleSubmit} className="space-y-5">
                                        {/* ── Dados pessoais ── */}
                                        <div>
                                            <label htmlFor="register-name" className="block text-sm font-medium text-[#78716c]">
                                                Nome completo
                                            </label>
                                            <input
                                                id="register-name"
                                                type="text"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className={inputClass}
                                                placeholder="Seu nome completo"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="register-email" className="block text-sm font-medium text-[#78716c]">
                                                E-mail
                                            </label>
                                            <input
                                                id="register-email"
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className={inputClass}
                                                placeholder="nome@fazenda.com"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="register-password" className="block text-sm font-medium text-[#78716c]">
                                                Senha
                                            </label>
                                            <input
                                                id="register-password"
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className={inputClass}
                                                placeholder="Mínimo de 8 caracteres"
                                                required
                                            />
                                            <p className="mt-1 text-xs text-[#a8a29e]">
                                                {PASSWORD_POLICY_MESSAGE}
                                            </p>
                                        </div>
                                        <div>
                                            <label htmlFor="register-password-confirm" className="block text-sm font-medium text-[#78716c]">
                                                Confirmar senha
                                            </label>
                                            <input
                                                id="register-password-confirm"
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className={inputClass}
                                                placeholder="Repita sua senha"
                                                required
                                            />
                                        </div>

                                        {/* ── Documento ── */}
                                        <div className="rounded-2xl border border-[#e7e5e4] bg-[#f5f5f4] p-4">
                                            <p className="mb-1 text-sm font-semibold text-[#1c1917]">Identificação</p>
                                            <p className="mb-3 text-xs text-[#78716c]">
                                                Usamos seu CNPJ ou CPF para confirmar que você é um produtor real.
                                            </p>

                                            {/* Seletor CNPJ / CPF */}
                                            <div className="mb-3 flex rounded-xl border border-[#e7e5e4] bg-white p-0.5">
                                                {(['CNPJ', 'CPF'] as const).map((type) => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() => handleDocTypeChange(type)}
                                                        className={`flex-1 rounded-[10px] py-2 text-sm font-semibold transition-colors ${
                                                            docType === type
                                                                ? 'bg-[#a8442a] text-white'
                                                                : 'text-[#78716c] hover:bg-[#f5f5f4]'
                                                        }`}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Input + botão consultar (CNPJ) */}
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={docValue}
                                                    onChange={(e) => handleDocInput(e.target.value)}
                                                    placeholder={docType === 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                                                    className="flex-1 rounded-xl border border-[#e7e5e4] bg-white px-3 py-2.5 text-sm text-[#1c1917] focus:outline-none focus:ring-2 focus:ring-[#a8442a]"
                                                />
                                                {docType === 'CNPJ' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleConsultarCNPJ()}
                                                        disabled={docDigits.length !== 14 || isCnpjLoading}
                                                        className="whitespace-nowrap rounded-xl bg-[#a8442a] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#933a22] disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        {isCnpjLoading ? (
                                                            <span className="flex items-center gap-1.5">
                                                                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                                </svg>
                                                                Buscando...
                                                            </span>
                                                        ) : 'Verificar'}
                                                    </button>
                                                )}
                                            </div>

                                            {/* Erro de documento */}
                                            {docError && (
                                                <p className="mt-2 text-xs text-[#8c4d39]">{docError}</p>
                                            )}

                                            {/* CPF válido → etapa de celular */}
                                            {docType === 'CPF' && cpfValid && (
                                                <div className="mt-3 space-y-3">
                                                    <div className="flex items-center gap-2 rounded-xl border border-[#b6d4b0] bg-[#edf4eb] px-3 py-2">
                                                        <svg className="h-4 w-4 shrink-0 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        <span className="text-xs font-medium text-[#16a34a]">CPF válido</span>
                                                    </div>

                                                    {/* Celular */}
                                                    {!phoneVerified && (
                                                        <div className="rounded-xl border border-[#e7e5e4] bg-white p-3 space-y-2">
                                                            <p className="text-xs font-semibold text-[#1c1917]">Confirme seu celular</p>
                                                            <p className="text-xs text-[#78716c]">Enviaremos um código de verificação por SMS.</p>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="tel"
                                                                    inputMode="numeric"
                                                                    value={phone}
                                                                    onChange={(e) => handlePhoneInput(e.target.value)}
                                                                    placeholder="(11) 99999-9999"
                                                                    disabled={otpSent}
                                                                    className="flex-1 rounded-xl border border-[#e7e5e4] bg-[#f5f5f4] px-3 py-2 text-sm text-[#1c1917] focus:outline-none focus:ring-2 focus:ring-[#a8442a] disabled:opacity-60"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleSendOtp()}
                                                                    disabled={phone.replace(/\D/g, '').length < 10 || isSendingOtp || otpSent}
                                                                    className="whitespace-nowrap rounded-xl bg-[#a8442a] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#933a22] disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    {isSendingOtp ? 'Enviando...' : otpSent ? 'Enviado ✓' : 'Enviar código'}
                                                                </button>
                                                            </div>

                                                            {/* Campo do código */}
                                                            {otpSent && (
                                                                <div className="space-y-2">
                                                                    <div className="flex gap-2">
                                                                        <input
                                                                            type="text"
                                                                            inputMode="numeric"
                                                                            maxLength={6}
                                                                            value={otpCode}
                                                                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                                                            placeholder="Código de 6 dígitos"
                                                                            className="flex-1 rounded-xl border border-[#e7e5e4] bg-[#f5f5f4] px-3 py-2 text-sm tracking-widest text-[#1c1917] focus:outline-none focus:ring-2 focus:ring-[#a8442a]"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void handleVerifyOtp()}
                                                                            disabled={otpCode.length !== 6 || isVerifyingOtp}
                                                                            className="whitespace-nowrap rounded-xl bg-[#a8442a] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#933a22] disabled:cursor-not-allowed disabled:opacity-50"
                                                                        >
                                                                            {isVerifyingOtp ? 'Verificando...' : 'Confirmar'}
                                                                        </button>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => { setOtpSent(false); setOtpCode(''); setOtpError(null); }}
                                                                        className="text-xs text-[#78716c] hover:underline"
                                                                    >
                                                                        Não recebi — reenviar
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {otpError && (
                                                                <p className="text-xs text-[#8c4d39]">{otpError}</p>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Celular verificado */}
                                                    {phoneVerified && (
                                                        <div className="flex items-center gap-2 rounded-xl border border-[#b6d4b0] bg-[#edf4eb] px-3 py-2">
                                                            <svg className="h-4 w-4 shrink-0 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            <span className="text-xs font-medium text-[#16a34a]">Celular verificado — {phone}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Resultado do CNPJ */}
                                            {cnpjResult && (
                                                <div className={`mt-3 rounded-xl border px-3 py-3 ${
                                                    cnpjIsActive
                                                        ? 'border-[#b6d4b0] bg-[#edf4eb]'
                                                        : 'border-[#f0d5ca] bg-[#faeee8]'
                                                }`}>
                                                    <div className="flex items-start gap-2">
                                                        {cnpjIsActive ? (
                                                            <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#a8442a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                                            </svg>
                                                        )}
                                                        <div className="min-w-0">
                                                            <p className={`text-xs font-bold uppercase tracking-wide ${cnpjIsActive ? 'text-[#16a34a]' : 'text-[#7a2a14]'}`}>
                                                                {cnpjResult.descricao_situacao_cadastral}
                                                            </p>
                                                            <p className="mt-0.5 text-sm font-semibold text-[#1c1917] leading-snug">
                                                                {cnpjResult.razao_social}
                                                            </p>
                                                            {cnpjResult.cnae_fiscal_descricao && (
                                                                <p className="mt-0.5 text-xs text-[#78716c] leading-snug">
                                                                    {cnpjResult.cnae_fiscal_descricao}
                                                                </p>
                                                            )}
                                                            {(cnpjResult.municipio || cnpjResult.uf) && (
                                                                <p className="mt-0.5 text-xs text-[#78716c]">
                                                                    {[cnpjResult.municipio, cnpjResult.uf].filter(Boolean).join(' — ')}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {!cnpjIsActive && (
                                                        <p className="mt-2 text-xs leading-relaxed text-[#7a2a14]">
                                                            Este CNPJ está com situação <strong>{cnpjResult.descricao_situacao_cadastral}</strong> na Receita Federal.
                                                            Selecione <strong>CPF</strong> acima para se cadastrar como produtor individual, ou tente outro CNPJ ativo.
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Celular + OTP para CNPJ ativo */}
                                            {docType === 'CNPJ' && cnpjIsActive && (
                                                <div className="mt-3 space-y-2">
                                                    {!phoneVerified ? (
                                                        <div className="rounded-xl border border-[#e7e5e4] bg-white p-3 space-y-2">
                                                            <p className="text-xs font-semibold text-[#1c1917]">Confirme seu celular</p>
                                                            <p className="text-xs text-[#78716c]">Último passo: vamos confirmar que você é uma pessoa real.</p>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="tel"
                                                                    inputMode="numeric"
                                                                    value={phone}
                                                                    onChange={(e) => handlePhoneInput(e.target.value)}
                                                                    placeholder="(11) 99999-9999"
                                                                    disabled={otpSent}
                                                                    className="flex-1 rounded-xl border border-[#e7e5e4] bg-[#f5f5f4] px-3 py-2 text-sm text-[#1c1917] focus:outline-none focus:ring-2 focus:ring-[#a8442a] disabled:opacity-60"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleSendOtp()}
                                                                    disabled={phone.replace(/\D/g, '').length < 10 || isSendingOtp || otpSent}
                                                                    className="whitespace-nowrap rounded-xl bg-[#a8442a] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#933a22] disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    {isSendingOtp ? 'Enviando...' : otpSent ? 'Enviado ✓' : 'Enviar código'}
                                                                </button>
                                                            </div>
                                                            {otpSent && (
                                                                <div className="space-y-2">
                                                                    <div className="flex gap-2">
                                                                        <input
                                                                            type="text"
                                                                            inputMode="numeric"
                                                                            maxLength={6}
                                                                            value={otpCode}
                                                                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                                                            placeholder="Código de 6 dígitos"
                                                                            className="flex-1 rounded-xl border border-[#e7e5e4] bg-[#f5f5f4] px-3 py-2 text-sm tracking-widest text-[#1c1917] focus:outline-none focus:ring-2 focus:ring-[#a8442a]"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void handleVerifyOtp()}
                                                                            disabled={otpCode.length !== 6 || isVerifyingOtp}
                                                                            className="whitespace-nowrap rounded-xl bg-[#a8442a] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#933a22] disabled:cursor-not-allowed disabled:opacity-50"
                                                                        >
                                                                            {isVerifyingOtp ? 'Verificando...' : 'Confirmar'}
                                                                        </button>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => { setOtpSent(false); setOtpCode(''); setOtpError(null); }}
                                                                        className="text-xs text-[#78716c] hover:underline"
                                                                    >
                                                                        Não recebi — reenviar
                                                                    </button>
                                                                </div>
                                                            )}
                                                            {otpError && <p className="text-xs text-[#8c4d39]">{otpError}</p>}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 rounded-xl border border-[#b6d4b0] bg-[#edf4eb] px-3 py-2">
                                                            <svg className="h-4 w-4 shrink-0 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            <span className="text-xs font-medium text-[#16a34a]">Celular verificado — {phone}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {error && (
                                            <div className="rounded-2xl bg-[#fbede8] px-4 py-3 text-sm text-[#8c4d39]">
                                                {error}
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isSubmitting || !canSubmit}
                                            className="w-full rounded-2xl bg-[#a8442a] py-3 font-semibold text-white transition-colors hover:bg-[#933a22] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmitting ? 'Criando conta...' : 'Criar conta grátis'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={onBack}
                                            className="w-full text-center text-sm font-medium text-[#78716c] transition-colors hover:text-[#a8442a]"
                                        >
                                            Já tenho conta
                                        </button>

                                        {/* ── Aceite legal ── */}
                                        <div className={`rounded-2xl border px-4 py-3 transition-colors ${
                                            termsAccepted
                                                ? 'border-[#b6d4b0] bg-[#edf4eb]'
                                                : 'border-[#e7e5e4] bg-[#f5f5f4]'
                                        }`}>
                                            <label className="flex cursor-pointer items-start gap-3">
                                                <div className="relative mt-0.5 shrink-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={termsAccepted}
                                                        onChange={(e) => setTermsAccepted(e.target.checked)}
                                                        className="peer sr-only"
                                                    />
                                                    <div className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                                                        termsAccepted
                                                            ? 'border-[#a8442a] bg-[#a8442a]'
                                                            : 'border-[#e7e5e4] bg-white'
                                                    }`}>
                                                        {termsAccepted && (
                                                            <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="text-xs leading-relaxed text-[#78716c]">
                                                    Li e concordo com os{' '}
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenModal('terms')}
                                                        className="font-semibold text-[#a8442a] underline-offset-2 hover:underline"
                                                    >
                                                        Termos de Uso
                                                    </button>
                                                    {', '}
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenModal('privacy')}
                                                        className="font-semibold text-[#a8442a] underline-offset-2 hover:underline"
                                                    >
                                                        Política de Privacidade
                                                    </button>
                                                    {' e '}
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenModal('cookies')}
                                                        className="font-semibold text-[#a8442a] underline-offset-2 hover:underline"
                                                    >
                                                        Política de Cookies
                                                    </button>
                                                    {' do EIXO.'}
                                                </span>
                                            </label>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Register;
