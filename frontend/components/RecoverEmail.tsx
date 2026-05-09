import React, { useState } from 'react';
import { buildApiUrl } from '../api';

interface RecoverEmailProps {
    onBack: () => void;
}

type Step = 'cnpj' | 'otp' | 'done';

const maskCnpj = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 14);
    return d
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
};

const RecoverEmail: React.FC<RecoverEmailProps> = ({ onBack }) => {
    const [step, setStep] = useState<Step>('cnpj');
    const [cnpj, setCnpj] = useState('');
    const [code, setCode] = useState('');
    const [maskedPhone, setMaskedPhone] = useState('');
    const [maskedEmail, setMaskedEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleRequestCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch(buildApiUrl('/auth/recover-email/request'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document: cnpj.replace(/\D/g, '') }),
            });
            const data = await res.json();
            if (!res.ok) return setError(data.message || 'Erro ao processar.');
            setMaskedPhone(data.maskedPhone || '');
            setStep('otp');
        } catch {
            setError('Não foi possível conectar ao servidor.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch(buildApiUrl('/auth/recover-email/verify'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document: cnpj.replace(/\D/g, ''), code }),
            });
            const data = await res.json();
            if (!res.ok) return setError(data.message || 'Código inválido.');
            setMaskedEmail(data.maskedEmail);
            setStep('done');
        } catch {
            setError('Não foi possível conectar ao servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#EDEDED] px-4">
            <div className="w-full max-w-md rounded-3xl border border-[#EDEDED] bg-white p-8 shadow-sm">

                {/* Logo */}
                <div className="mb-8 flex flex-col items-center">
                    <img src="/logo_eixo_official.svg" alt="EIXO" className="h-8" />
                </div>

                {step === 'cnpj' && (
                    <form onSubmit={handleRequestCode} className="space-y-5">
                        <div>
                            <h1 className="font-brand text-2xl font-extrabold text-[#2F2F2F]">Recuperar e-mail</h1>
                            <p className="mt-1 text-sm text-[#5E5E5E]">
                                Informe o CNPJ cadastrado. Enviaremos um código de verificação para o celular vinculado.
                            </p>
                        </div>

                        {error && (
                            <div className="rounded-2xl bg-[rgba(184,66,50,0.08)] px-4 py-3 text-sm text-[#b84232]">
                                {error}
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-sm font-semibold text-[#2F2F2F]">CNPJ</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={maskCnpj(cnpj)}
                                onChange={(e) => setCnpj(e.target.value.replace(/\D/g, ''))}
                                placeholder="00.000.000/0001-00"
                                maxLength={18}
                                required
                                className="w-full rounded-2xl border border-[#EDEDED] bg-[#EDEDED] px-4 py-3 text-sm text-[#2F2F2F] outline-none focus:border-[#B6E23A] focus:ring-2 focus:ring-[#B6E23A]/30"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || cnpj.replace(/\D/g, '').length !== 14}
                            className="w-full rounded-2xl bg-[#B6E23A] py-3 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[#a3d130] disabled:opacity-50"
                        >
                            {loading ? 'Enviando...' : 'Enviar código por SMS'}
                        </button>

                        <button type="button" onClick={onBack} className="w-full text-sm text-[#5E5E5E] hover:text-[#2F2F2F] hover:underline">
                            Voltar ao login
                        </button>
                    </form>
                )}

                {step === 'otp' && (
                    <form onSubmit={handleVerifyCode} className="space-y-5">
                        <div>
                            <h1 className="font-brand text-2xl font-extrabold text-[#2F2F2F]">Código enviado</h1>
                            <p className="mt-1 text-sm text-[#5E5E5E]">
                                Enviamos um código para o celular <span className="font-semibold text-[#2F2F2F]">{maskedPhone}</span>. Digite abaixo para confirmar.
                            </p>
                        </div>

                        {error && (
                            <div className="rounded-2xl bg-[rgba(184,66,50,0.08)] px-4 py-3 text-sm text-[#b84232]">
                                {error}
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-sm font-semibold text-[#2F2F2F]">Código de verificação</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="000000"
                                maxLength={6}
                                required
                                className="w-full rounded-2xl border border-[#EDEDED] bg-[#EDEDED] px-4 py-3 text-center text-lg font-bold tracking-[0.3em] text-[#2F2F2F] outline-none focus:border-[#B6E23A] focus:ring-2 focus:ring-[#B6E23A]/30"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || code.length !== 6}
                            className="w-full rounded-2xl bg-[#B6E23A] py-3 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[#a3d130] disabled:opacity-50"
                        >
                            {loading ? 'Verificando...' : 'Confirmar código'}
                        </button>

                        <button type="button" onClick={() => { setStep('cnpj'); setCode(''); setError(null); }} className="w-full text-sm text-[#5E5E5E] hover:text-[#2F2F2F] hover:underline">
                            Usar outro CNPJ
                        </button>
                    </form>
                )}

                {step === 'done' && (
                    <div className="space-y-5 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f0f9d4]">
                            <svg className="h-7 w-7 text-[#B6E23A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="font-brand text-2xl font-extrabold text-[#2F2F2F]">E-mail encontrado</h1>
                            <p className="mt-2 text-sm text-[#5E5E5E]">
                                O e-mail vinculado ao seu CNPJ é:
                            </p>
                            <p className="mt-3 text-lg font-bold text-[#2F2F2F]">{maskedEmail}</p>
                            <p className="mt-1 text-xs text-[#5E5E5E]">
                                Use esse e-mail para entrar na sua conta.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onBack}
                            className="w-full rounded-2xl bg-[#B6E23A] py-3 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[#a3d130]"
                        >
                            Ir para o login
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RecoverEmail;
