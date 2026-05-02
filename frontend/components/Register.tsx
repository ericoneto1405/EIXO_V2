import React, { useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../api';
import LegalModal, { type LegalDoc, LEGAL_CONTENT } from './LegalModal';

interface RegisterProps {
    onSuccess: () => void;
    onBack: () => void;
}

const PASSWORD_POLICY_MESSAGE = 'A senha deve ter pelo menos 8 caracteres, com ao menos 1 letra e 1 número.';

const isPasswordStrongEnough = (value: string) =>
    value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);

const isEmailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

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
    const lastAutoFetchedCnpjRef = useRef<string | null>(null);

    const docDigits = docValue.replace(/\D/g, '');
    const cnpjIsActive = cnpjResult?.descricao_situacao_cadastral === 'ATIVA';
    const docVerified = docType === 'CNPJ' ? cnpjIsActive : cpfValid;
    const isNameValid = name.trim().length > 0;
    const isRegisterEmailValid = isEmailValid(email);
    const isPasswordValid = isPasswordStrongEnough(password);
    const isPasswordConfirmationValid = confirmPassword.length > 0 && password === confirmPassword;
    const isDocInputValid = docType === 'CNPJ'
        ? docDigits.length === 14 && validateCNPJ(docDigits)
        : docDigits.length === 11 && validateCPF(docDigits);
    const canSubmit = isNameValid
        && isRegisterEmailValid
        && isPasswordValid
        && isPasswordConfirmationValid
        && docVerified
        && phoneVerified
        && termsAccepted;

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
        lastAutoFetchedCnpjRef.current = null;
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

    useEffect(() => {
        if (docType !== 'CNPJ') {
            lastAutoFetchedCnpjRef.current = null;
            return;
        }

        if (!validateCNPJ(docDigits)) {
            if (docDigits.length < 14) {
                lastAutoFetchedCnpjRef.current = null;
            }
            return;
        }

        if (lastAutoFetchedCnpjRef.current === docDigits || isCnpjLoading) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            lastAutoFetchedCnpjRef.current = docDigits;
            void handleConsultarCNPJ();
        }, 350);

        return () => window.clearTimeout(timeoutId);
    }, [docType, docDigits, isCnpjLoading]);

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

    const inputClass = 'mt-1 w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]';
    const primaryButtonClass = 'bg-[var(--eixo-green)] text-[#1a1a1a] shadow-sm hover:bg-[var(--eixo-green-dark)]';
    const disabledButtonClass = 'cursor-not-allowed bg-[#b8d58a] text-[rgba(47,58,45,0.78)] shadow-[inset_0_0_0_1px_rgba(118,184,42,0.12)] hover:bg-[#b8d58a]';

    return (
        <div className="min-h-screen bg-[var(--eixo-bg)] text-[var(--eixo-text)]">
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
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--eixo-surface)] via-[var(--eixo-bg)]/82 to-[var(--eixo-bg)]/60" />

                <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-8 lg:px-8">
                    <div className="mb-10">
                        <img src="/eixo-logo-render.png" alt="eixo" className="h-10 w-auto" />
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--eixo-text-muted)]">Plataforma de Gestão Pecuária</div>
                    </div>

                    <div className="flex flex-1 items-center justify-center">
                        <div className="w-full max-w-xl rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]/95 shadow-xl backdrop-blur">
                            <div className="flex flex-col justify-center p-8 lg:p-10">
                                <div className="mx-auto w-full max-w-md">
                                    <button
                                        type="button"
                                        onClick={onBack}
                                        className="mb-6 inline-flex items-center text-sm font-medium text-[var(--eixo-text-muted)] transition-colors hover:text-[var(--eixo-green)]"
                                    >
                                        ← VOLTAR
                                    </button>
                                    <div className="mb-5">
                                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                                            Crie sua conta
                                        </div>
                                        <div>
                                            <p className="text-sm uppercase tracking-[0.18em] text-[var(--eixo-text-muted)]">Plano grátis</p>
                                            <h2 className="mt-2 text-3xl font-black text-[var(--eixo-text)]">Comece agora</h2>
                                            <p className="mt-3 text-sm leading-relaxed text-[var(--eixo-text-muted)]">
                                                Sem cartão para começar. Organize sua fazenda hoje.
                                            </p>
                                        </div>
                                    </div>

                                    <form onSubmit={handleSubmit} className="space-y-4">
                                        {/* ── Documento ── */}
                                        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4">
                                            <p className="mb-1 text-sm font-semibold text-[var(--eixo-text)]">Identificação</p>
                                            <p className="mb-3 text-xs text-[var(--eixo-text-muted)]">
                                                Usamos seu CNPJ ou CPF para confirmar que você é um produtor real.
                                            </p>

                                            {/* Seletor CNPJ / CPF */}
                                            <div className="mb-3 flex rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-0.5">
                                                {(['CNPJ', 'CPF'] as const).map((type) => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() => handleDocTypeChange(type)}
                                                        className={`flex-1 rounded-[10px] py-2 text-sm font-semibold transition-colors ${
                                                            docType === type
                                                                ? 'bg-[var(--eixo-green)] text-[#1a1a1a]'
                                                                : 'text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]'
                                                        }`}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Input do documento */}
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={docValue}
                                                    onChange={(e) => handleDocInput(e.target.value)}
                                                    placeholder={docType === 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                                                    className="flex-1 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                                                />
                                            </div>

                                            {docType === 'CNPJ' && isDocInputValid && (
                                                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--eixo-text-muted)]">
                                                    {isCnpjLoading ? (
                                                        <>
                                                            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                            </svg>
                                                            <span>Buscando dados do CNPJ...</span>
                                                        </>
                                                    ) : cnpjResult ? (
                                                        <>
                                                            <svg className="h-3.5 w-3.5 text-[var(--eixo-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            <span>CNPJ consultado automaticamente.</span>
                                                        </>
                                                    ) : (
                                                        <span>Vamos consultar esse CNPJ automaticamente.</span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Erro de documento */}
                                            {docError && (
                                                <p className="mt-2 text-xs text-[var(--eixo-danger)]">{docError}</p>
                                            )}

                                            {/* CPF válido → etapa de celular */}
                                            {docType === 'CPF' && cpfValid && (
                                                <div className="mt-3 space-y-3">
                                                    <div className="flex items-center gap-2 rounded-xl border border-[#b6d4b0] bg-[var(--eixo-green-soft)] px-3 py-2">
                                                        <svg className="h-4 w-4 shrink-0 text-[var(--eixo-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        <span className="text-xs font-medium text-[var(--eixo-success)]">CPF válido</span>
                                                    </div>

                                                    {/* Celular */}
                                                    {!phoneVerified && (
                                                        <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-3 space-y-2">
                                                            <p className="text-xs font-semibold text-[var(--eixo-text)]">Confirme seu celular</p>
                                                            <p className="text-xs text-[var(--eixo-text-muted)]">Enviaremos um código de verificação por SMS.</p>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="tel"
                                                                    inputMode="numeric"
                                                                    value={phone}
                                                                    onChange={(e) => handlePhoneInput(e.target.value)}
                                                                    placeholder="(11) 99999-9999"
                                                                    disabled={otpSent}
                                                                    className="flex-1 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)] disabled:opacity-60"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleSendOtp()}
                                                                    disabled={phone.replace(/\D/g, '').length < 10 || isSendingOtp || otpSent}
                                                                    className="whitespace-nowrap rounded-xl bg-[var(--eixo-green)] px-3 py-2 text-xs font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:bg-[var(--eixo-green)]/35 disabled:text-[#1a1a1a]/80 disabled:hover:bg-[var(--eixo-green)]/35"
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
                                                                            className="flex-1 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2 text-sm tracking-widest text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void handleVerifyOtp()}
                                                                            disabled={otpCode.length !== 6 || isVerifyingOtp}
                                                                            className="whitespace-nowrap rounded-xl bg-[var(--eixo-green)] px-3 py-2 text-xs font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:bg-[var(--eixo-green)]/35 disabled:text-[#1a1a1a]/80 disabled:hover:bg-[var(--eixo-green)]/35"
                                                                        >
                                                                            {isVerifyingOtp ? 'Verificando...' : 'Confirmar'}
                                                                        </button>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => { setOtpSent(false); setOtpCode(''); setOtpError(null); }}
                                                                        className="text-xs text-[var(--eixo-text-muted)] hover:underline"
                                                                    >
                                                                        Não recebi — reenviar
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {otpError && (
                                                                <p className="text-xs text-[var(--eixo-danger)]">{otpError}</p>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Celular verificado */}
                                                    {phoneVerified && (
                                                        <div className="flex items-center gap-2 rounded-xl border border-[#b6d4b0] bg-[var(--eixo-green-soft)] px-3 py-2">
                                                            <svg className="h-4 w-4 shrink-0 text-[var(--eixo-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            <span className="text-xs font-medium text-[var(--eixo-success)]">Celular verificado — {phone}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Resultado do CNPJ */}
                                            {cnpjResult && (
                                                <div className={`mt-3 rounded-xl border px-3 py-3 ${
                                                    cnpjIsActive
                                                        ? 'border-[#b6d4b0] bg-[var(--eixo-green-soft)]'
                                                        : 'border-[var(--eixo-border)] bg-[var(--eixo-green-soft)]'
                                                }`}>
                                                    <div className="flex items-start gap-2">
                                                        {cnpjIsActive ? (
                                                            <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--eixo-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--eixo-green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                                            </svg>
                                                        )}
                                                        <div className="min-w-0">
                                                            <p className={`text-xs font-bold uppercase tracking-wide ${cnpjIsActive ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-graphite)]'}`}>
                                                                {cnpjResult.descricao_situacao_cadastral}
                                                            </p>
                                                            <p className="mt-0.5 text-sm font-semibold text-[var(--eixo-text)] leading-snug">
                                                                {cnpjResult.razao_social}
                                                            </p>
                                                            {cnpjResult.cnae_fiscal_descricao && (
                                                                <p className="mt-0.5 text-xs text-[var(--eixo-text-muted)] leading-snug">
                                                                    {cnpjResult.cnae_fiscal_descricao}
                                                                </p>
                                                            )}
                                                            {(cnpjResult.municipio || cnpjResult.uf) && (
                                                                <p className="mt-0.5 text-xs text-[var(--eixo-text-muted)]">
                                                                    {[cnpjResult.municipio, cnpjResult.uf].filter(Boolean).join(' — ')}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {!cnpjIsActive && (
                                                        <p className="mt-2 text-xs leading-relaxed text-[var(--eixo-graphite)]">
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
                                                        <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-3 space-y-2">
                                                            <p className="text-xs font-semibold text-[var(--eixo-text)]">Confirme seu celular</p>
                                                            <p className="text-xs text-[var(--eixo-text-muted)]">Último passo: vamos confirmar que você é uma pessoa real.</p>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="tel"
                                                                    inputMode="numeric"
                                                                    value={phone}
                                                                    onChange={(e) => handlePhoneInput(e.target.value)}
                                                                    placeholder="(11) 99999-9999"
                                                                    disabled={otpSent}
                                                                    className="flex-1 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)] disabled:opacity-60"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleSendOtp()}
                                                                    disabled={phone.replace(/\D/g, '').length < 10 || isSendingOtp || otpSent}
                                                                    className="whitespace-nowrap rounded-xl bg-[var(--eixo-green)] px-3 py-2 text-xs font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:bg-[var(--eixo-green)]/35 disabled:text-[#1a1a1a]/80 disabled:hover:bg-[var(--eixo-green)]/35"
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
                                                                            className="flex-1 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2 text-sm tracking-widest text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void handleVerifyOtp()}
                                                                            disabled={otpCode.length !== 6 || isVerifyingOtp}
                                                                            className="whitespace-nowrap rounded-xl bg-[var(--eixo-green)] px-3 py-2 text-xs font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:bg-[var(--eixo-green)]/35 disabled:text-[#1a1a1a]/80 disabled:hover:bg-[var(--eixo-green)]/35"
                                                                        >
                                                                            {isVerifyingOtp ? 'Verificando...' : 'Confirmar'}
                                                                        </button>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => { setOtpSent(false); setOtpCode(''); setOtpError(null); }}
                                                                        className="text-xs text-[var(--eixo-text-muted)] hover:underline"
                                                                    >
                                                                        Não recebi — reenviar
                                                                    </button>
                                                                </div>
                                                            )}
                                                            {otpError && <p className="text-xs text-[var(--eixo-danger)]">{otpError}</p>}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 rounded-xl border border-[#b6d4b0] bg-[var(--eixo-green-soft)] px-3 py-2">
                                                            <svg className="h-4 w-4 shrink-0 text-[var(--eixo-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            <span className="text-xs font-medium text-[var(--eixo-success)]">Celular verificado — {phone}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* ── Dados pessoais ── */}
                                        <div>
                                            <label htmlFor="register-name" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
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
                                            <label htmlFor="register-email" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
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
                                            <label htmlFor="register-password" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
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
                                            <p className="mt-1 text-xs text-[var(--eixo-text)]/70">
                                                {PASSWORD_POLICY_MESSAGE}
                                            </p>
                                        </div>
                                        <div>
                                            <label htmlFor="register-password-confirm" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
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

                                        {error && (
                                            <div className="rounded-2xl bg-[rgba(184,66,50,0.08)] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                                                {error}
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isSubmitting || !canSubmit}
                                            className={`w-full rounded-2xl py-3 font-semibold transition-colors ${(isSubmitting || !canSubmit) ? disabledButtonClass : primaryButtonClass}`}
                                        >
                                            {isSubmitting ? 'Criando conta...' : 'Criar conta grátis'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={onBack}
                                            className="-mt-1 w-full text-center text-sm text-[var(--eixo-text)]/72 transition-colors hover:text-[var(--eixo-green-dark)]"
                                        >
                                            <span className="font-semibold text-[var(--eixo-green-dark)] underline decoration-[var(--eixo-green)]/45 underline-offset-2">
                                                Já tenho conta
                                            </span>
                                        </button>

                                        {/* ── Aceite legal ── */}
                                        <div className={`rounded-2xl border px-4 py-2.5 transition-colors ${
                                            termsAccepted
                                                ? 'border-[#cfe2c7] bg-[rgba(237,247,230,0.72)]'
                                                : 'border-[var(--eixo-border)]/80 bg-[rgba(240,242,239,0.62)]'
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
                                                            ? 'border-[var(--eixo-green)] bg-[var(--eixo-green)]'
                                                            : 'border-[var(--eixo-border)] bg-[var(--eixo-surface)]'
                                                    }`}>
                                                        {termsAccepted && (
                                                            <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="text-xs leading-relaxed text-[var(--eixo-text)]/66">
                                                    Li e concordo com os{' '}
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenModal('terms')}
                                                        className="font-medium text-[var(--eixo-text)]/72 underline decoration-[var(--eixo-border-strong)]/70 underline-offset-2 hover:text-[var(--eixo-text)]"
                                                    >
                                                        Termos de Uso
                                                    </button>
                                                    {', '}
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenModal('privacy')}
                                                        className="font-medium text-[var(--eixo-text)]/72 underline decoration-[var(--eixo-border-strong)]/70 underline-offset-2 hover:text-[var(--eixo-text)]"
                                                    >
                                                        Política de Privacidade
                                                    </button>
                                                    {' e '}
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenModal('cookies')}
                                                        className="font-medium text-[var(--eixo-text)]/72 underline decoration-[var(--eixo-border-strong)]/70 underline-offset-2 hover:text-[var(--eixo-text)]"
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
