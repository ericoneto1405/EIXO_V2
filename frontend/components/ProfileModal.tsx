import React, { useRef, useState } from 'react';
import { buildApiUrl } from '../api';

interface ProfileUser {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    avatarUrl?: string | null;
}

interface ProfileModalProps {
    user: ProfileUser;
    onClose: () => void;
    onUpdated: (updates: Partial<ProfileUser>) => void;
}

type Tab = 'dados' | 'celular' | 'senha' | 'foto';

const CloseIcon: React.FC = () => (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const formatPhone = (digits: string) => {
    const d = digits.replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return digits;
};

const ProfileModal: React.FC<ProfileModalProps> = ({ user, onClose, onUpdated }) => {
    const RESEND_COOLDOWN_SECONDS = 45;
    const EDIT_PHONE_COOLDOWN_SECONDS = 5 * 60;
    const [activeTab, setActiveTab] = useState<Tab>('dados');

    // ── Dados pessoais ──
    const [name, setName] = useState(user.name);
    const [email, setEmail] = useState(user.email);
    const [dadosLoading, setDadosLoading] = useState(false);
    const [dadosError, setDadosError] = useState<string | null>(null);
    const [dadosSuccess, setDadosSuccess] = useState(false);

    const handleSaveDados = async () => {
        setDadosError(null);
        setDadosSuccess(false);
        setDadosLoading(true);
        try {
            const res = await fetch(buildApiUrl('/auth/me/profile'), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setDadosError(payload?.message || 'Erro ao salvar.');
                return;
            }
            setDadosSuccess(true);
            onUpdated({ name: name.trim(), email: email.trim().toLowerCase() });
        } catch {
            setDadosError('Não foi possível conectar ao servidor.');
        } finally {
            setDadosLoading(false);
        }
    };

    // ── Celular ──
    const [phone, setPhone] = useState(user.phone ? formatPhone(user.phone) : '');
    const [otpSent, setOtpSent] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [otpVerified, setOtpVerified] = useState(false);
    const [phoneLoading, setPhoneLoading] = useState(false);
    const [phoneError, setPhoneError] = useState<string | null>(null);
    const [phoneSuccess, setPhoneSuccess] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [phoneEditCount, setPhoneEditCount] = useState(0);

    const phoneDigits = phone.replace(/\D/g, '');
    const currentPhoneDigits = (user.phone || '').replace(/\D/g, '');

    React.useEffect(() => {
        if (resendCooldown <= 0) return;
        const id = window.setInterval(() => {
            setResendCooldown((current) => Math.max(0, current - 1));
        }, 1000);
        return () => window.clearInterval(id);
    }, [resendCooldown]);

    const handleEditPhone = () => {
        const nextEditCount = phoneEditCount + 1;
        setOtpSent(false);
        setOtpVerified(false);
        setOtpCode('');
        setPhoneError(null);
        setPhoneSuccess(false);
        setPhoneEditCount(nextEditCount);
        setResendCooldown(nextEditCount >= 2 ? EDIT_PHONE_COOLDOWN_SECONDS : 0);
    };

    const handleSendOtp = async () => {
        setPhoneError(null);
        if (phoneDigits === currentPhoneDigits) {
            setPhoneError('O novo celular deve ser diferente do celular atual.');
            return;
        }
        if (resendCooldown > 0) {
            setPhoneError(`Aguarde ${resendCooldown}s para reenviar o código.`);
            return;
        }
        setPhoneLoading(true);
        try {
            const res = await fetch(buildApiUrl('/auth/send-otp'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ phone: phoneDigits }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setPhoneError(payload?.message || 'Erro ao enviar SMS.');
                return;
            }
            setOtpSent(true);
            setResendCooldown(RESEND_COOLDOWN_SECONDS);
        } catch {
            setPhoneError('Não foi possível enviar o SMS.');
        } finally {
            setPhoneLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        setPhoneError(null);
        setPhoneLoading(true);
        try {
            const res = await fetch(buildApiUrl('/auth/verify-otp'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ phone: phoneDigits, code: otpCode }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setPhoneError(payload?.message || 'Código incorreto.');
                return;
            }
            setOtpVerified(true);
        } catch {
            setPhoneError('Não foi possível verificar o código.');
        } finally {
            setPhoneLoading(false);
        }
    };

    const handleResendOtp = async () => {
        if (phoneLoading || resendCooldown > 0) return;
        await handleSendOtp();
    };

    const handleSavePhone = async () => {
        setPhoneError(null);
        setPhoneLoading(true);
        try {
            const res = await fetch(buildApiUrl('/auth/me/phone'), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ phone: phoneDigits }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setPhoneError(payload?.message || 'Erro ao salvar celular.');
                return;
            }
            setPhoneSuccess(true);
            setOtpSent(false);
            setOtpVerified(false);
            setOtpCode('');
            onUpdated({ phone: phoneDigits });
        } catch {
            setPhoneError('Não foi possível conectar ao servidor.');
        } finally {
            setPhoneLoading(false);
        }
    };

    // ── Senha ──
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [senhaLoading, setSenhaLoading] = useState(false);
    const [senhaError, setSenhaError] = useState<string | null>(null);
    const [senhaSuccess, setSenhaSuccess] = useState(false);

    const handleSaveSenha = async () => {
        setSenhaError(null);
        setSenhaSuccess(false);
        if (newPassword !== confirmPassword) {
            setSenhaError('As senhas não coincidem.');
            return;
        }
        if (newPassword.length < 6) {
            setSenhaError('A nova senha deve ter pelo menos 6 caracteres.');
            return;
        }
        setSenhaLoading(true);
        try {
            const res = await fetch(buildApiUrl('/auth/me/password'), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSenhaError(payload?.message || 'Erro ao atualizar senha.');
                return;
            }
            setSenhaSuccess(true);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch {
            setSenhaError('Não foi possível conectar ao servidor.');
        } finally {
            setSenhaLoading(false);
        }
    };

    // ── Foto ──
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatarUrl ? buildApiUrl(user.avatarUrl) : null);
    const [fotoLoading, setFotoLoading] = useState(false);
    const [fotoError, setFotoError] = useState<string | null>(null);
    const [fotoSuccess, setFotoSuccess] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setFotoError('Arquivo muito grande. Máximo 5 MB.');
            return;
        }
        setFotoError(null);
        setFotoSuccess(false);
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const dataUrl = ev.target?.result as string;
            setAvatarPreview(dataUrl);
            const base64 = dataUrl.split(',')[1];
            setFotoLoading(true);
            try {
                const res = await fetch(buildApiUrl('/auth/me/avatar'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ contentBase64: base64, mimeType: file.type }),
                });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setFotoError(payload?.message || 'Erro ao salvar foto.');
                    return;
                }
                setFotoSuccess(true);
                onUpdated({ avatarUrl: payload.avatarUrl });
            } catch {
                setFotoError('Não foi possível salvar a foto.');
            } finally {
                setFotoLoading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const tabs: { id: Tab; label: string }[] = [
        { id: 'dados', label: 'Dados Pessoais' },
        { id: 'celular', label: 'Celular' },
        { id: 'senha', label: 'Senha' },
        { id: 'foto', label: 'Foto' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
            <div
                className="w-full max-w-lg rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-4">
                    <h2 className="font-brand text-lg font-bold text-[var(--eixo-text)]">Meu Perfil</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)]"
                    >
                        <CloseIcon />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 border-b border-[var(--eixo-border)] px-6 pt-4">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`mb-[-1px] rounded-t-xl px-4 py-2 text-sm font-semibold transition-colors ${
                                activeTab === tab.id
                                    ? 'border-b-2 border-[var(--eixo-green)] text-[var(--eixo-text)]'
                                    : 'text-[var(--eixo-text-muted)] hover:text-[var(--eixo-text)]'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Conteúdo */}
                <div className="p-6">

                    {/* ── Dados Pessoais ── */}
                    {activeTab === 'dados' && (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--eixo-text-muted)]">Nome</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => { setName(e.target.value); setDadosSuccess(false); }}
                                    className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] focus:ring-2 focus:ring-[var(--eixo-green)]/30"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--eixo-text-muted)]">E-mail</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => { setEmail(e.target.value); setDadosSuccess(false); }}
                                    className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] focus:ring-2 focus:ring-[var(--eixo-green)]/30"
                                />
                            </div>
                            {dadosError && <p className="text-sm text-[var(--eixo-danger)]">{dadosError}</p>}
                            {dadosSuccess && <p className="text-sm text-[var(--eixo-success)]">Dados atualizados com sucesso.</p>}
                            <button
                                type="button"
                                onClick={handleSaveDados}
                                disabled={dadosLoading}
                                className="w-full rounded-xl bg-[#B6E23A] py-2.5 text-sm font-bold text-[#1a1a1a] hover:bg-[#a3d130] disabled:opacity-60"
                            >
                                {dadosLoading ? 'Salvando...' : 'Salvar dados'}
                            </button>
                        </div>
                    )}

                    {/* ── Celular ── */}
                    {activeTab === 'celular' && (
                        <div className="space-y-4">
                            {user.phone && !phoneSuccess && (
                                <p className="text-sm text-[var(--eixo-text-muted)]">
                                    Celular atual: <span className="font-semibold text-[var(--eixo-text)]">{formatPhone(user.phone)}</span>
                                </p>
                            )}
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--eixo-text-muted)]">Novo celular</label>
                                <div className="flex gap-2">
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={e => { setPhone(e.target.value); setPhoneSuccess(false); setPhoneError(null); }}
                                        placeholder="(00) 00000-0000"
                                        disabled={otpVerified || otpSent}
                                        className="flex-1 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] focus:ring-2 focus:ring-[var(--eixo-green)]/30 disabled:bg-[var(--eixo-surface-soft)]/70"
                                    />
                                    {!otpVerified && (
                                        <button
                                            type="button"
                                            onClick={handleSendOtp}
                                            disabled={phoneLoading || phoneDigits.length < 10 || phoneDigits === currentPhoneDigits || otpSent || resendCooldown > 0}
                                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50"
                                        >
                                            {otpSent ? 'Enviado ✓' : resendCooldown > 0 ? `Aguarde ${resendCooldown}s` : 'Enviar SMS'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {otpSent && !otpVerified && (
                                <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--eixo-text-muted)]">Código SMS</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={otpCode}
                                            onChange={e => setOtpCode(e.target.value)}
                                            placeholder="000000"
                                            maxLength={6}
                                            className="flex-1 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] focus:ring-2 focus:ring-[var(--eixo-green)]/30"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleVerifyOtp}
                                            disabled={phoneLoading || otpCode.length < 4}
                                            className="rounded-xl bg-[var(--eixo-text)] px-4 py-2.5 text-sm font-semibold text-[var(--eixo-surface)] transition-colors hover:bg-[var(--eixo-graphite)] disabled:opacity-50"
                                        >
                                            Verificar
                                        </button>
                                    </div>
                                    <div className="mt-2 flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => void handleResendOtp()}
                                            disabled={phoneLoading || resendCooldown > 0}
                                            className="text-xs text-[var(--eixo-text-muted)] hover:underline disabled:cursor-not-allowed disabled:opacity-55 disabled:no-underline"
                                        >
                                            {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Não recebi — reenviar'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleEditPhone}
                                            className="text-xs text-[var(--eixo-text-muted)] hover:underline"
                                        >
                                            Editar número
                                        </button>
                                    </div>
                                </div>
                            )}
                            {otpVerified && !phoneSuccess && (
                                <p className="text-sm font-medium text-[var(--eixo-success)]">✓ Número verificado. Clique em salvar.</p>
                            )}
                            {phoneError && <p className="text-sm text-[var(--eixo-danger)]">{phoneError}</p>}
                            {phoneSuccess && <p className="text-sm text-[var(--eixo-success)]">Celular atualizado com sucesso.</p>}
                            {otpVerified && !phoneSuccess && (
                                <button
                                    type="button"
                                    onClick={handleSavePhone}
                                    disabled={phoneLoading}
                                    className="w-full rounded-xl bg-[#B6E23A] py-2.5 text-sm font-bold text-[#1a1a1a] hover:bg-[#a3d130] disabled:opacity-60"
                                >
                                    {phoneLoading ? 'Salvando...' : 'Salvar celular'}
                                </button>
                            )}
                        </div>
                    )}

                    {/* ── Senha ── */}
                    {activeTab === 'senha' && (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--eixo-text-muted)]">Senha atual</label>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={e => { setCurrentPassword(e.target.value); setSenhaSuccess(false); }}
                                    className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] focus:ring-2 focus:ring-[var(--eixo-green)]/30"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--eixo-text-muted)]">Nova senha</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={e => { setNewPassword(e.target.value); setSenhaSuccess(false); }}
                                    className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] focus:ring-2 focus:ring-[var(--eixo-green)]/30"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--eixo-text-muted)]">Confirmar nova senha</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => { setConfirmPassword(e.target.value); setSenhaSuccess(false); }}
                                    className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] focus:ring-2 focus:ring-[var(--eixo-green)]/30"
                                />
                            </div>
                            {senhaError && <p className="text-sm text-[var(--eixo-danger)]">{senhaError}</p>}
                            {senhaSuccess && <p className="text-sm text-[var(--eixo-success)]">Senha atualizada com sucesso.</p>}
                            <button
                                type="button"
                                onClick={handleSaveSenha}
                                disabled={senhaLoading}
                                className="w-full rounded-xl bg-[#B6E23A] py-2.5 text-sm font-bold text-[#1a1a1a] hover:bg-[#a3d130] disabled:opacity-60"
                            >
                                {senhaLoading ? 'Salvando...' : 'Atualizar senha'}
                            </button>
                        </div>
                    )}

                    {/* ── Foto ── */}
                    {activeTab === 'foto' && (
                        <div className="flex flex-col items-center gap-6">
                            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--eixo-border)] bg-[var(--eixo-text)] text-2xl font-bold text-[var(--eixo-surface)]">
                                {avatarPreview ? (
                                    <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                                ) : (
                                    <span>{user.name.split(' ').slice(0,2).map(w => w[0]?.toUpperCase()).join('')}</span>
                                )}
                            </div>
                            <div className="w-full text-center">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={fotoLoading}
                                    className="rounded-xl bg-[#B6E23A] px-6 py-2.5 text-sm font-bold text-[#1a1a1a] hover:bg-[#a3d130] disabled:opacity-60"
                                >
                                    {fotoLoading ? 'Enviando...' : 'Escolher foto'}
                                </button>
                                <p className="mt-2 text-xs text-[var(--eixo-text-muted)]">JPEG, PNG ou WebP — máximo 5 MB</p>
                            </div>
                            {fotoError && <p className="text-sm text-[var(--eixo-danger)]">{fotoError}</p>}
                            {fotoSuccess && <p className="text-sm text-[var(--eixo-success)]">Foto atualizada com sucesso.</p>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfileModal;
