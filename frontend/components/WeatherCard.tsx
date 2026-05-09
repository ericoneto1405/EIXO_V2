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

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayForecast {
    date: string;        // YYYY-MM-DD
    weatherCode: number;
    tempMax: number;
    tempMin: number;
    precipitation: number;
}

interface WeatherCardProps {
    city: string | null;
    lat?: number | null;
    lng?: number | null;
}

// ─── Componente ───────────────────────────────────────────────────────────────

const WeatherCard: React.FC<WeatherCardProps> = ({ city, lat, lng }) => {
    const [forecast, setForecast] = useState<DayForecast[]>([]);
    const [resolvedCity, setResolvedCity] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if ((!city || city.trim() === '') && !lat) { setLoading(false); return; }
        let active = true;

        const load = async () => {
            setLoading(true);
            setError(false);
            try {
                let latitude = lat;
                let longitude = lng;
                let displayCity = city;

                // Geocoding se não tiver coordenadas
                if (!latitude || !longitude) {
                    const geoRes = await fetch(
                        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city ?? '')}&country_code=BR&count=1&language=pt`,
                        { signal: AbortSignal.timeout(15000) }
                    );
                    const geoData = await geoRes.json();
                    const result = geoData?.results?.[0];
                    if (!result) throw new Error('Cidade não encontrada');
                    latitude = result.latitude;
                    longitude = result.longitude;
                    displayCity = result.name;
                }

                const wRes = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
                    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum` +
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
                }));

                if (!active) return;
                setForecast(days);
                setResolvedCity(displayCity);
            } catch (err) {
                console.error('[WeatherCard]', err);
                if (active) setError(true);
            } finally {
                if (active) setLoading(false);
            }
        };

        load();
        return () => { active = false; };
    }, [city, lat, lng]);

    if ((!city || city.trim() === '') && !lat) return null;

    return (
        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm overflow-hidden">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-5 py-4">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--eixo-green-soft)] text-lg">
                        🌤️
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-[var(--eixo-text)]">Previsão do Tempo</p>
                        {resolvedCity && (
                            <p className="text-xs text-[var(--eixo-text-muted)]">{resolvedCity} • próximos 7 dias</p>
                        )}
                    </div>
                </div>
                <span className="text-[10px] text-[#a8a29e]">Open-Meteo</span>
            </div>

            {/* Conteúdo */}
            {loading ? (
                <div className="flex gap-3 overflow-x-auto px-5 py-4">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="flex min-w-[70px] flex-col items-center gap-2">
                            <div className="h-3 w-8 animate-pulse rounded bg-[var(--eixo-surface-soft)]" />
                            <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--eixo-surface-soft)]" />
                            <div className="h-3 w-10 animate-pulse rounded bg-[var(--eixo-surface-soft)]" />
                            <div className="h-3 w-6 animate-pulse rounded bg-[var(--eixo-surface-soft)]" />
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
                        return (
                            <div
                                key={day.date}
                                className={`flex min-w-[72px] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-3 ${
                                    isToday ? 'bg-[var(--eixo-green-soft)]' : 'hover:bg-[var(--eixo-surface-soft)]'
                                }`}
                            >
                                <p className={`text-[11px] font-semibold ${isToday ? 'text-[var(--eixo-graphite)]' : 'text-[var(--eixo-text-muted)]'}`}>
                                    {isToday ? 'Hoje' : DAYS[d.getDay()]}
                                </p>
                                <span className="text-2xl leading-none" title={wmoLabel(day.weatherCode)}>
                                    {wmoIcon(day.weatherCode)}
                                </span>
                                <p className="text-xs font-bold text-[var(--eixo-text)]">
                                    {day.tempMax}°
                                    <span className="font-normal text-[var(--eixo-text-muted)]"> {day.tempMin}°</span>
                                </p>
                                {day.precipitation > 0 && (
                                    <p className="text-[10px] text-[#3b82f6]">{day.precipitation} mm</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default WeatherCard;
