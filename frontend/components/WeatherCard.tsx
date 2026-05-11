import React, { useEffect, useState } from 'react';

// ─── WMO code → ícone + descrição ────────────────────────────────────────────

const wmoIcon = (code: number): string => {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌦️';
    if (code <= 86) return '❄️';
    return '⛈️';
};

const wmoLabel = (code: number): string => {
    if (code === 0) return 'Céu limpo';
    if (code === 1) return 'Predom. limpo';
    if (code === 2) return 'Parcial. nublado';
    if (code === 3) return 'Nublado';
    if (code <= 48) return 'Neblina';
    if (code <= 55) return 'Garoa leve';
    if (code <= 67) return 'Chuva';
    if (code <= 77) return 'Neve';
    if (code <= 82) return 'Chuva passageira';
    if (code <= 86) return 'Neve passageira';
    return 'Trovoada';
};

const rainColor = (mm: number): string => {
    if (mm === 0) return 'text-[#a8a29e]';
    if (mm < 5) return 'text-[#60a5fa]';
    if (mm < 20) return 'text-[#2563eb]';
    return 'text-[#1e3a8a]';
};

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayForecast {
    date: string;
    weatherCode: number;
    tempMax: number;
    tempMin: number;
    precipitation: number;
    precipProb: number;
}

interface WeatherCardProps {
    city: string | null;
    lat?: number | null;
    lng?: number | null;
    onNavigateToFarms?: () => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

const WeatherCard: React.FC<WeatherCardProps> = ({ city, lat, lng, onNavigateToFarms }) => {
    const [forecast, setForecast] = useState<DayForecast[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    const hasCoords = Boolean(lat && lng);
    const hasCity = Boolean(city && city.trim());

    useEffect(() => {
        if (!hasCoords && !hasCity) return;
        let active = true;

        const load = async () => {
            setLoading(true);
            setError(false);
            try {
                let latitude = lat;
                let longitude = lng;

                // Fallback: geocodifica pela cidade se não tiver coordenadas
                if (!hasCoords && hasCity) {
                    const cityName = (city ?? '').split('/')[0].trim();
                    const geoRes = await fetch(
                        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&country_code=BR&count=1&language=pt`,
                        { signal: AbortSignal.timeout(15000) }
                    );
                    const geoData = await geoRes.json();
                    const result = geoData?.results?.[0];
                    if (!result) throw new Error('Cidade não encontrada');
                    latitude = result.latitude;
                    longitude = result.longitude;
                }

                const wRes = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
                    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max` +
                    `&timezone=America%2FSao_Paulo&forecast_days=7`,
                    { signal: AbortSignal.timeout(15000) }
                );
                const wData = await wRes.json();
                const d = wData?.daily;
                if (!d?.time?.length) throw new Error('Sem dados');

                const days: DayForecast[] = d.time.map((date: string, i: number) => ({
                    date,
                    weatherCode: d.weather_code?.[i] ?? d.weathercode?.[i] ?? 0,
                    tempMax: Math.round(d.temperature_2m_max[i] ?? 0),
                    tempMin: Math.round(d.temperature_2m_min[i] ?? 0),
                    precipitation: Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
                    precipProb: Math.round(d.precipitation_probability_max?.[i] ?? 0),
                }));

                if (!active) return;
                setForecast(days);
            } catch (err) {
                console.error('[WeatherCard]', err);
                if (active) setError(true);
            } finally {
                if (active) setLoading(false);
            }
        };

        load();
        return () => { active = false; };
    }, [lat, lng, city]);

    // ── Sem coordenadas ───────────────────────────────────────────────────────
    if (!hasCoords) {
        return (
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
                <div className="flex items-center gap-2 border-b border-[var(--eixo-border)] px-5 py-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--eixo-green-soft)] text-lg">🌤️</div>
                    <p className="text-sm font-semibold text-[var(--eixo-text)]">Previsão do Tempo</p>
                </div>
                <div className="flex flex-col items-center px-5 py-6 text-center">
                    <p className="text-sm text-[var(--eixo-text-muted)]">
                        Cadastre as <span className="font-semibold text-[var(--eixo-text)]">coordenadas GPS</span> da fazenda para receber a previsão do tempo.
                    </p>
                    <p className="mt-1 text-xs text-[#a8a29e]">Fazendas → Editar fazenda → Localização GPS</p>
                    {onNavigateToFarms && (
                        <button
                            type="button"
                            onClick={onNavigateToFarms}
                            className="mt-4 rounded-xl border-2 border-[#5a8c00] bg-[#B6E23A] px-5 py-2 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[#a3d130]"
                        >
                            Ir para Fazendas
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // ── Totais semanais ───────────────────────────────────────────────────────
    const totalRain = Math.round(forecast.reduce((sum, d) => sum + d.precipitation, 0) * 10) / 10;

    return (
        <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-5 py-4">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--eixo-green-soft)] text-lg">🌤️</div>
                    <div>
                        <p className="text-sm font-semibold text-[var(--eixo-text)]">Previsão do Tempo</p>
                        {city && <p className="text-xs text-[var(--eixo-text-muted)]">{city} · próximos 7 dias</p>}
                    </div>
                </div>
                {!loading && !error && forecast.length > 0 && (
                    <div className={`rounded-full px-3 py-1 text-xs font-bold ${totalRain > 0 ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-[var(--eixo-surface-soft)] text-[#a8a29e]'}`}>
                        {totalRain > 0 ? `☔ ${totalRain} mm esta semana` : '☀️ Semana seca'}
                    </div>
                )}
            </div>

            {/* Conteúdo */}
            {loading ? (
                <div className="flex gap-3 overflow-x-auto px-5 py-4">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="flex min-w-[70px] flex-col items-center gap-2">
                            <div className="h-3 w-8 animate-pulse rounded bg-[var(--eixo-surface-soft)]" />
                            <div className="h-6 w-12 animate-pulse rounded bg-[var(--eixo-surface-soft)]" />
                            <div className="h-3 w-10 animate-pulse rounded bg-[var(--eixo-surface-soft)]" />
                        </div>
                    ))}
                </div>
            ) : error ? (
                <p className="px-5 py-4 text-sm text-[#a8a29e]">Não foi possível carregar a previsão.</p>
            ) : (
                <div className="flex gap-1 overflow-x-auto px-4 py-4">
                    {forecast.map((day, i) => {
                        const d = new Date(day.date + 'T12:00:00');
                        const isToday = i === 0;
                        const isRainy = day.precipitation >= 5;
                        return (
                            <div
                                key={day.date}
                                className={`flex min-w-[72px] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-3 ${
                                    isToday ? 'bg-[var(--eixo-green-soft)]' : isRainy ? 'bg-[#eff6ff]' : 'hover:bg-[var(--eixo-surface-soft)]'
                                }`}
                            >
                                {/* Dia */}
                                <p className={`text-[11px] font-semibold ${isToday ? 'text-[var(--eixo-graphite)]' : 'text-[var(--eixo-text-muted)]'}`}>
                                    {isToday ? 'Hoje' : DAYS[d.getDay()]}
                                </p>

                                {/* Chuva — destaque principal */}
                                <p className={`text-base font-extrabold leading-none ${rainColor(day.precipitation)}`}>
                                    {day.precipitation > 0 ? `${day.precipitation}mm` : 'Seco'}
                                </p>

                                {/* Probabilidade */}
                                {day.precipProb > 0 && (
                                    <p className="text-[10px] font-semibold text-[#60a5fa]">{day.precipProb}%</p>
                                )}

                                {/* Ícone de condição */}
                                <span className="text-xl leading-none" title={wmoLabel(day.weatherCode)}>
                                    {wmoIcon(day.weatherCode)}
                                </span>

                                {/* Temperatura — secundária */}
                                <p className="text-[11px] text-[var(--eixo-text-muted)]">
                                    {day.tempMax}° <span className="text-[10px]">{day.tempMin}°</span>
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default WeatherCard;
