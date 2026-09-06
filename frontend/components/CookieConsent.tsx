import React from 'react';
import LegalModal from './LegalModal';

export const COOKIE_CONSENT_STORAGE_KEY = 'eixo_cookie_consent';

export interface CookiePreferences {
  essential: true;
  analytics: boolean;
  marketing: boolean;
}

// Lê a preferência salva. Sem valor = ainda não decidiu (undefined).
export function getCookieConsent(): CookiePreferences | undefined {
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return undefined;
    if (raw === 'true') return { essential: true, analytics: true, marketing: true }; // formato antigo
    const parsed = JSON.parse(raw);
    if (typeof parsed?.analytics === 'boolean' && typeof parsed?.marketing === 'boolean') {
      return { essential: true, analytics: parsed.analytics, marketing: parsed.marketing };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function saveCookieConsent(prefs: CookiePreferences) {
  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify({ ...prefs, updatedAt: new Date().toISOString() }));
}

interface CookieConsentProps {
  onVisibilityChange?: (visible: boolean) => void;
}

const primaryBtn =
  'w-full rounded-xl bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-semibold text-[#1a1a1a] transition-colors duration-150 hover:bg-[var(--eixo-green-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]';
const policyLinkBtn =
  'text-sm font-bold text-[var(--eixo-text-muted)] underline-offset-2 transition-colors duration-150 hover:text-[var(--eixo-text)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)] rounded';
const textBtn =
  'text-xs font-medium text-[var(--eixo-text-muted)] underline-offset-2 transition-colors duration-150 hover:text-[var(--eixo-text)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)] rounded';

const ToggleRow: React.FC<{
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}> = ({ title, desc, checked, disabled, onChange }) => (
  <div className="flex items-center justify-between gap-3 py-2">
    <div>
      <p className="text-sm font-semibold text-[var(--eixo-text)]">{title}</p>
      <p className="text-xs text-[var(--eixo-text-muted)]">{desc}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)] focus:ring-offset-2 ${
        checked ? 'bg-[var(--eixo-green)]' : 'bg-[var(--eixo-border)]'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  </div>
);

const CookieConsent: React.FC<CookieConsentProps> = ({ onVisibilityChange }) => {
  const [visible, setVisible] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [showPolicy, setShowPolicy] = React.useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState(false);
  const [marketingEnabled, setMarketingEnabled] = React.useState(false);

  React.useEffect(() => {
    const saved = getCookieConsent();
    setVisible(!saved);
    onVisibilityChange?.(!saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (prefs: CookiePreferences) => {
    saveCookieConsent(prefs);
    setVisible(false);
    setExpanded(false);
    onVisibilityChange?.(false);
  };

  const handleAcceptAll = () => finish({ essential: true, analytics: true, marketing: true });
  const handleRejectNonEssential = () => finish({ essential: true, analytics: false, marketing: false });
  const handleSavePreferences = () => finish({ essential: true, analytics: analyticsEnabled, marketing: marketingEnabled });

  if (!visible) return null;

  return (
    <>
      <div className="fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-full sm:max-w-sm">
        <div className="rounded-3xl border-2 border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-xl shadow-black/10">
          {!expanded ? (
            <>
              <p className="text-sm text-[var(--eixo-text)]">
                Usamos cookies para melhorar sua experiência e navegação no site.{' '}
                <button type="button" onClick={() => setShowPolicy(true)} className={policyLinkBtn}>
                  Política de Cookies
                </button>
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={handleAcceptAll} className={primaryBtn}>
                  Aceito todos os Cookies
                </button>
                <div className="flex items-center justify-between px-0.5">
                  <button type="button" onClick={() => setExpanded(true)} className={textBtn}>
                    Personalizar
                  </button>
                  <button type="button" onClick={handleRejectNonEssential} className={textBtn}>
                    Rejeitar
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-[var(--eixo-text)]">Preferências de cookies</p>
              <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                Saiba mais na{' '}
                <button type="button" onClick={() => setShowPolicy(true)} className={policyLinkBtn}>
                  Política de Cookies
                </button>.
              </p>
              <div className="mt-2 divide-y divide-[var(--eixo-border)]">
                <ToggleRow
                  title="Essenciais"
                  desc="Mantêm o site funcionando. Não podem ser desativados."
                  checked
                  disabled
                />
                <ToggleRow
                  title="Analíticos"
                  desc="Entendem como o site é usado (ex.: Google Analytics)."
                  checked={analyticsEnabled}
                  onChange={setAnalyticsEnabled}
                />
                <ToggleRow
                  title="Marketing"
                  desc="Personalizam anúncios (ex.: Meta Pixel)."
                  checked={marketingEnabled}
                  onChange={setMarketingEnabled}
                />
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={handleSavePreferences} className={primaryBtn}>
                  Salvar preferências
                </button>
                <div className="flex items-center justify-between px-0.5">
                  <button type="button" onClick={() => setExpanded(false)} className={textBtn}>
                    Voltar
                  </button>
                  <button type="button" onClick={handleAcceptAll} className={textBtn}>
                    Aceitar todos
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {showPolicy && <LegalModal doc="cookies" onClose={() => setShowPolicy(false)} />}
    </>
  );
};

export default CookieConsent;
