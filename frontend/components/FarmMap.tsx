import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { buildApiUrl } from '../api';
import { Farm, Paddock } from '../types';

import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

// Fix leaflet default icon URLs broken by Vite bundler
L.Icon.Default.mergeOptions({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaddockSummary {
    paddockId: string;
    paddockName: string;
    areaHa: number;
    divisionType: string | null;
    animalCount: number;
    poAnimalCount: number;
    totalAnimals: number;
    totalWeightKg: number;
    lotacaoUaHa: number | null;
}

interface ImportedFeature {
    feature: Feature;
    assignedPaddockId: string;
}

interface FarmMapProps {
    farm: Farm;
    onClose?: () => void;
    onGeometrySaved: (updatedFarm: Farm) => void;
    asPage?: boolean;
}

// ─── Normalize GeoJSON features (unwrap GeometryCollection, convert closed LineStrings) ──

/** Converts a closed LineString geometry to a Polygon, or returns null if open. */
const lineStringToPolygon = (coords: number[][]): Geometry | null => {
    if (coords.length < 4) return null;
    const first = coords[0];
    const last = coords[coords.length - 1];
    const isClosed = first[0] === last[0] && first[1] === last[1];
    if (!isClosed) return null;
    return { type: 'Polygon', coordinates: [coords] } as Geometry;
};

const normalizeFeature = (f: Feature): Feature[] => {
    const type = f.geometry?.type;
    if (type === 'Polygon' || type === 'MultiPolygon') return [f];
    if (type === 'LineString') {
        const poly = lineStringToPolygon((f.geometry as { coordinates: number[][] }).coordinates);
        if (poly) return [{ ...f, geometry: poly }];
        return [];
    }
    if (type === 'MultiLineString') {
        const rings = (f.geometry as { coordinates: number[][][] }).coordinates
            .filter((ring) => {
                const first = ring[0]; const last = ring[ring.length - 1];
                return ring.length >= 4 && first[0] === last[0] && first[1] === last[1];
            });
        if (rings.length > 0) {
            const poly: Geometry = { type: 'Polygon', coordinates: rings } as Geometry;
            return [{ ...f, geometry: poly }];
        }
        return [];
    }
    if (type === 'GeometryCollection') {
        const gc = f.geometry as { type: string; geometries: Geometry[] };
        const results: Feature[] = [];
        gc.geometries.forEach((g, i) => {
            const sub: Feature = {
                ...f,
                geometry: g,
                properties: { ...f.properties, name: `${f.properties?.name ?? 'Geometria'} ${i + 1}` },
            };
            results.push(...normalizeFeature(sub));
        });
        return results;
    }
    return [];
};

// ─── Color by division type ───────────────────────────────────────────────────

const divisionColor = (type: string | null | undefined): string => {
    switch (type) {
        case 'curral de manejo': return '#c47a00';
        case 'área de preservação': return '#2d7a3a';
        default: return '#9d7d4d';
    }
};

// ─── Geoman controller (inner, has access to map instance) ───────────────────

interface GeomanControllerProps {
    enabled: boolean;
    onLayerCreated: (layer: L.Layer) => void;
    onLayerEdited: (layer: L.Layer) => void;
}

const GeomanController: React.FC<GeomanControllerProps> = ({ enabled, onLayerCreated, onLayerEdited }) => {
    const map = useMap();

    useEffect(() => {
        if (!map.pm) return;

        if (enabled) {
            map.pm.addControls({
                position: 'topleft',
                drawMarker: false,
                drawCircleMarker: false,
                drawPolyline: false,
                drawCircle: false,
                drawText: false,
                rotateMode: false,
                cutPolygon: false,
            });
        } else {
            map.pm.removeControls();
            map.pm.disableDraw();
            map.pm.disableGlobalEditMode();
        }
    }, [enabled, map]);

    useEffect(() => {
        if (!map.pm) return;

        const handleCreate = (e: { layer: L.Layer }) => onLayerCreated(e.layer);
        const handleEdit = (e: { layer: L.Layer }) => onLayerEdited(e.layer);

        map.on('pm:create', handleCreate);
        map.on('pm:edit', handleEdit);

        return () => {
            map.off('pm:create', handleCreate);
            map.off('pm:edit', handleEdit);
        };
    }, [map, onLayerCreated, onLayerEdited]);

    return null;
};

// ─── Map center controller ────────────────────────────────────────────────────

const MapCenterController: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
    const map = useMap();
    useEffect(() => {
        map.setView([lat, lng], 15);
    }, [lat, lng, map]);
    return null;
};

// ─── Main component ───────────────────────────────────────────────────────────

const FarmMap: React.FC<FarmMapProps> = ({ farm, onClose, onGeometrySaved, asPage = false }) => {
    const [editMode, setEditMode] = useState(false);
    const [selectedPaddock, setSelectedPaddock] = useState<Paddock | null>(null);
    const [summary, setSummary] = useState<Map<string, PaddockSummary>>(new Map());
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
    const [showImport, setShowImport] = useState(false);
    const [importedFeatures, setImportedFeatures] = useState<ImportedFeature[]>([]);
    const [importError, setImportError] = useState<string | null>(null);

    // Local paddock geometries — starts from farm.paddocks, updated on draw/edit
    const [paddockGeometries, setPaddockGeometries] = useState<Record<string, Geometry>>(() => {
        const init: Record<string, Geometry> = {};
        for (const p of farm.paddocks) {
            if (p.mapGeometry) init[p.id] = p.mapGeometry as Geometry;
        }
        return init;
    });

    // Version counter per paddock — increments on each geometry update so GeoJSON keys stay stable
    const [geoVersions, setGeoVersions] = useState<Record<string, number>>({});

    // Helper: update a paddock geometry and bump its key version so GeoJSON re-renders correctly
    const setGeometry = useCallback((paddockId: string, geometry: Geometry) => {
        setPaddockGeometries((prev) => ({ ...prev, [paddockId]: geometry }));
        setGeoVersions((prev: Record<string, number>) => ({ ...prev, [paddockId]: (prev[paddockId] ?? 0) + 1 }));
    }, []);

    // Re-sync geometries when farm.paddocks changes (e.g. after save)
    useEffect(() => {
        setPaddockGeometries((prev: Record<string, Geometry>) => {
            const next: Record<string, Geometry> = { ...prev };
            for (const p of farm.paddocks) {
                if (p.mapGeometry) next[p.id] = p.mapGeometry as Geometry;
            }
            return next;
        });
    }, [farm.paddocks]);

    // Pending drawn layer awaiting paddock assignment
    const [pendingLayer, setPendingLayer] = useState<{ layer: L.Layer; geojson: Feature } | null>(null);
    const [pendingAssignPaddockId, setPendingAssignPaddockId] = useState('');

    const mapRef = useRef<L.Map | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const centerLat = farm.lat ?? -15.7801;
    const centerLng = farm.lng ?? -47.9292;

    // Load map summary (animal counts per paddock)
    useEffect(() => {
        fetch(buildApiUrl(`/farms/${farm.id}/map-summary`), { credentials: 'include' })
            .then((r) => r.ok ? r.json() : Promise.reject())
            .then((data: { summary?: PaddockSummary[] }) => {
                const m = new Map<string, PaddockSummary>();
                for (const s of data.summary ?? []) m.set(s.paddockId, s);
                setSummary(m);
            })
            .catch(() => setSummary(new Map()));
    }, [farm.id]);

    // ── Draw handlers ──────────────────────────────────────────────────────────

    const handleLayerCreated = useCallback((layer: L.Layer) => {
        const geojson = (layer as L.Polygon).toGeoJSON() as Feature;
        setPendingLayer({ layer, geojson });
        setPendingAssignPaddockId(farm.paddocks[0]?.id ?? '');
    }, [farm.paddocks]);

    const handleLayerEdited = useCallback((layer: L.Layer) => {
        const geojson = (layer as L.Polygon).toGeoJSON() as Feature;
        const paddockId = (layer as L.Polygon & { options: { paddockId?: string } }).options.paddockId;
        if (paddockId) {
            setGeometry(paddockId, geojson.geometry);
        }
    }, [setGeometry]);

    const confirmPendingLayer = () => {
        if (!pendingLayer || !pendingAssignPaddockId) return;
        setGeometry(pendingAssignPaddockId, (pendingLayer.geojson as Feature).geometry);
        mapRef.current?.removeLayer(pendingLayer.layer);
        setPendingLayer(null);
    };

    const cancelPendingLayer = () => {
        if (pendingLayer) mapRef.current?.removeLayer(pendingLayer.layer);
        setPendingLayer(null);
    };

    // ── Save geometries ────────────────────────────────────────────────────────

    const handleSave = async () => {
        setSaveError(null);
        setSaveSuccess(null);
        setIsSaving(true);

        const paddocksPayload = farm.paddocks.map((p) => ({
            id: p.id,
            name: p.name,
            areaHa: p.areaHa,
            divisionType: p.divisionType,
            mapGeometry: paddockGeometries[p.id] ?? null,
        }));

        try {
            const res = await fetch(buildApiUrl(`/farms/${farm.id}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    name: farm.name,
                    city: farm.city,
                    lat: farm.lat,
                    lng: farm.lng,
                    size: farm.size,
                    responsibleName: farm.responsibleName,
                    notes: farm.notes,
                    paddocks: paddocksPayload,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSaveError(data?.message ?? 'Erro ao salvar geometrias.');
                return;
            }
            setSaveSuccess('Geometrias salvas com sucesso.');
            onGeometrySaved(data.farm);
        } catch {
            setSaveError('Erro de conexão. Verifique e tente novamente.');
        } finally {
            setIsSaving(false);
        }
    };

    // ── KML / GeoJSON import ───────────────────────────────────────────────────

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        setImportError(null);
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            let geojson: FeatureCollection | null = null;
            const name = file.name.toLowerCase();

            if (name.endsWith('.geojson') || name.endsWith('.json')) {
                const text = await file.text();
                geojson = JSON.parse(text) as FeatureCollection;
            } else if (name.endsWith('.kml')) {
                const text = await file.text();
                const parser = new DOMParser();
                const kmlDoc = parser.parseFromString(text, 'text/xml');
                const { kml } = await import('@tmcw/togeojson');
                geojson = kml(kmlDoc) as FeatureCollection;
            } else if (name.endsWith('.kmz')) {
                const JSZip = (await import('jszip')).default;
                const zip = await JSZip.loadAsync(file);
                const kmlFile = Object.values(zip.files).find((f) => f.name.endsWith('.kml'));
                if (!kmlFile) throw new Error('Arquivo KMZ não contém um arquivo KML.');
                const kmlText = await kmlFile.async('text');
                const parser = new DOMParser();
                const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
                const { kml } = await import('@tmcw/togeojson');
                geojson = kml(kmlDoc) as FeatureCollection;
            } else {
                throw new Error('Formato não suportado. Use .kml, .kmz ou .geojson.');
            }

            if (!geojson?.features?.length) throw new Error('Nenhuma geometria encontrada no arquivo.');

            const polygons = geojson.features.flatMap(normalizeFeature);
            if (!polygons.length) {
                throw new Error('Nenhum polígono encontrado no arquivo. Verifique se é um arquivo do CAR ou exportado de um GIS.');
            }

            setImportedFeatures(
                polygons.map((f, i) => ({
                    feature: f,
                    assignedPaddockId: farm.paddocks[i]?.id ?? farm.paddocks[0]?.id ?? '',
                })),
            );
        } catch (err: unknown) {
            setImportError(err instanceof Error ? err.message : 'Erro ao processar o arquivo.');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const confirmImport = () => {
        for (const item of importedFeatures) {
            if (item.assignedPaddockId) {
                setGeometry(item.assignedPaddockId, item.feature.geometry as Geometry);
            }
        }
        setImportedFeatures([]);
        setShowImport(false);
        setSaveSuccess('Geometrias importadas. Clique em "Salvar" para persistir.');
    };

    // ── Helpers ────────────────────────────────────────────────────────────────

    const getSummary = (paddockId: string): PaddockSummary | undefined =>
        summary.get(paddockId);

    const hasPaddocksWithGeometry = Object.keys(paddockGeometries).length > 0;

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className={asPage ? 'flex h-full flex-col bg-[#fbf7ef]' : 'fixed inset-0 z-50 flex flex-col bg-[#fbf7ef]'}>
            {/* Header */}
            <div className="flex items-center justify-between gap-4 border-b border-[#d7cab3] bg-[#fbf7ef] px-5 py-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8a7350]">Mapa da Fazenda</p>
                    <h2 className="text-lg font-bold text-[#2f3a2d]">{farm.name}</h2>
                </div>

                <div className="flex items-center gap-2">
                    {editMode && (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowImport(true)}
                                className="rounded-xl border border-[#c7b59b] bg-[#f3ebde] px-3 py-2 text-xs font-semibold text-[#5f5648] transition-colors hover:bg-[#eadfcd]"
                            >
                                Importar KML / GeoJSON
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={isSaving}
                                className="rounded-xl bg-[#9d7d4d] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#8f7144] disabled:bg-[#b8ab95]"
                            >
                                {isSaving ? 'Salvando...' : 'Salvar geometrias'}
                            </button>
                        </>
                    )}

                    <button
                        type="button"
                        onClick={() => { setEditMode((v) => !v); setSaveError(null); setSaveSuccess(null); }}
                        className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                            editMode
                                ? 'border-[#9d7d4d] bg-[#9d7d4d] text-white hover:bg-[#8f7144]'
                                : 'border-[#c7b59b] bg-[#f3ebde] text-[#5f5648] hover:bg-[#eadfcd]'
                        }`}
                    >
                        {editMode ? 'Modo Edição Ativo' : 'Editar Geometrias'}
                    </button>

                    {!asPage && onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Fechar mapa"
                            className="rounded-xl border border-[#d7cab3] bg-[#f3ebde] p-2 text-[#5f5648] transition-colors hover:bg-[#eadfcd]"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Status messages */}
            {(saveError || saveSuccess) && (
                <div className={`px-5 py-2 text-sm font-medium ${saveError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {saveError ?? saveSuccess}
                </div>
            )}

            {/* Main layout */}
            <div className="relative flex flex-1 overflow-hidden">
                {/* Map */}
                <div className="flex-1">
                    <MapContainer
                        center={[centerLat, centerLng]}
                        zoom={farm.lat ? 15 : 5}
                        style={{ height: '100%', width: '100%' }}
                        ref={(map) => { if (map) mapRef.current = map; }}
                    >
                        <TileLayer
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics"
                            maxZoom={19}
                        />

                        {/* Paddock polygons */}
                        {farm.paddocks.map((paddock) => {
                            const geometry = paddockGeometries[paddock.id];
                            if (!geometry) return null;
                            const featureData: Feature = {
                                type: 'Feature',
                                geometry,
                                properties: { paddockId: paddock.id, name: paddock.name },
                            };
                            return (
                                <GeoJSON
                                    key={`${paddock.id}-${geoVersions[paddock.id] ?? 0}`}
                                    data={featureData}
                                    style={{
                                        color: divisionColor(paddock.divisionType),
                                        weight: 2,
                                        fillOpacity: 0.25,
                                        fillColor: divisionColor(paddock.divisionType),
                                    }}
                                    eventHandlers={{
                                        click: () => setSelectedPaddock(paddock),
                                    }}
                                    onEachFeature={(_, layer) => {
                                        (layer as L.Polygon & { options: { paddockId: string } }).options.paddockId = paddock.id;
                                        layer.bindTooltip(paddock.name, { permanent: false, direction: 'center' });
                                    }}
                                />
                            );
                        })}

                        {/* Imported features preview */}
                        {importedFeatures.map((item, i) => (
                            <GeoJSON
                                key={`import-${i}`}
                                data={item.feature}
                                style={{ color: '#3b82f6', weight: 2, fillOpacity: 0.2, fillColor: '#3b82f6', dashArray: '6 4' }}
                            />
                        ))}

                        <GeomanController
                            enabled={editMode}
                            onLayerCreated={handleLayerCreated}
                            onLayerEdited={handleLayerEdited}
                        />

                        {farm.lat && farm.lng && (
                            <>
                                <MapCenterController lat={farm.lat} lng={farm.lng} />
                                <Marker position={[farm.lat, farm.lng]}>
                                    <Tooltip permanent direction="top" offset={[0, -10]}>
                                        {farm.name}
                                    </Tooltip>
                                </Marker>
                            </>
                        )}
                    </MapContainer>
                </div>

                {/* Paddock info sidebar */}
                {selectedPaddock && (
                    <div className="absolute right-0 top-0 z-[1000] h-full w-72 overflow-y-auto border-l border-[#d7cab3] bg-[#fbf7ef] shadow-lg">
                        <div className="flex items-center justify-between border-b border-[#d7cab3] px-4 py-3">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8a7350]">Divisão</span>
                            <button
                                type="button"
                                onClick={() => setSelectedPaddock(null)}
                                className="rounded-lg p-1 text-[#6d6558] hover:bg-[#f3ebde]"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4 p-4">
                            <div>
                                <h3 className="text-base font-bold text-[#2f3a2d]">{selectedPaddock.name}</h3>
                                <p className="mt-0.5 text-xs text-[#6d6558] capitalize">{selectedPaddock.divisionType ?? 'Pasto'}</p>
                            </div>

                            <div className="space-y-2 rounded-[16px] border border-[#e2d7c7] bg-[#f6efe3] p-3">
                                <InfoRow label="Área" value={selectedPaddock.areaHa != null ? `${selectedPaddock.areaHa.toFixed(2)} ha` : '—'} />
                                <InfoRow label="Capacidade" value={selectedPaddock.capacity != null ? `${selectedPaddock.capacity} UA` : '—'} />
                            </div>

                            {(() => {
                                const s = getSummary(selectedPaddock.id);
                                if (!s) return (
                                    <p className="text-xs text-[#7b715f]">Carregando dados de lotação...</p>
                                );
                                return (
                                    <div className="space-y-2 rounded-[16px] border border-[#e2d7c7] bg-[#f6efe3] p-3">
                                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8a7350]">Lotação atual</p>
                                        <InfoRow label="Animais comerciais" value={String(s.animalCount)} />
                                        <InfoRow label="Animais P.O." value={String(s.poAnimalCount)} />
                                        <InfoRow label="Total de animais" value={String(s.totalAnimals)} />
                                        <InfoRow
                                            label="Peso total"
                                            value={s.totalWeightKg > 0 ? `${s.totalWeightKg.toFixed(0)} kg` : '—'}
                                        />
                                        <InfoRow
                                            label="Lotação (UA/ha)"
                                            value={s.lotacaoUaHa != null ? `${s.lotacaoUaHa.toFixed(2)} UA/ha` : '—'}
                                            highlight={s.lotacaoUaHa != null}
                                        />
                                    </div>
                                );
                            })()}

                            {!paddockGeometries[selectedPaddock.id] && editMode && (
                                <p className="rounded-xl border border-[#e2d7c7] bg-[#fff8ee] p-3 text-xs text-[#7b715f]">
                                    Nenhum polígono desenhado para esta divisão. Use as ferramentas do mapa para criar um.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Pending layer assignment dialog */}
                {pendingLayer && (
                    <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/30">
                        <div className="w-80 rounded-[24px] border border-[#d7cab3] bg-[#fbf7ef] p-6 shadow-2xl">
                            <h3 className="mb-1 text-base font-bold text-[#2f3a2d]">Associar polígono</h3>
                            <p className="mb-4 text-sm text-[#6d6558]">A qual divisão este polígono pertence?</p>
                            <select
                                value={pendingAssignPaddockId}
                                onChange={(e) => setPendingAssignPaddockId(e.target.value)}
                                className="mb-4 mt-1 block w-full rounded-xl border border-[#d8cbb5] bg-[#fdf9f2] px-3 py-2.5 text-sm text-[#2f3a2d] focus:border-[#9d7d4d] focus:outline-none"
                            >
                                {farm.paddocks.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={cancelPendingLayer}
                                    className="rounded-xl border border-[#c7b59b] bg-[#f3ebde] px-4 py-2 text-sm font-semibold text-[#5f5648] hover:bg-[#eadfcd]"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmPendingLayer}
                                    className="rounded-xl bg-[#9d7d4d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8f7144]"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 border-t border-[#d7cab3] bg-[#fbf7ef] px-5 py-2">
                <span className="text-xs font-semibold text-[#6d6558]">Legenda:</span>
                <LegendItem color="#9d7d4d" label="Pasto" />
                <LegendItem color="#c47a00" label="Curral de manejo" />
                <LegendItem color="#2d7a3a" label="Área de preservação" />
                {!hasPaddocksWithGeometry && (
                    <span className="ml-auto text-xs text-[#7b715f]">
                        {editMode
                            ? 'Use as ferramentas à esquerda do mapa para desenhar os polígonos das divisões.'
                            : 'Nenhum polígono cadastrado. Ative "Editar Geometrias" para começar.'}
                    </span>
                )}
            </div>

            {/* Import modal */}
            {showImport && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-lg rounded-[24px] border border-[#d7cab3] bg-[#fbf7ef] p-6 shadow-2xl">
                        <h3 className="mb-1 text-lg font-bold text-[#2f3a2d]">Importar geometrias</h3>
                        <p className="mb-4 text-sm text-[#6d6558]">
                            Selecione um arquivo <strong>.kml</strong>, <strong>.kmz</strong> ou <strong>.geojson</strong> com os polígonos das divisões da fazenda (ex.: exportado do CAR).
                        </p>

                        <label className="flex cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[#ccb894] bg-[#f7f0e3] py-8 transition-colors hover:bg-[#f2e7d4]">
                            <svg className="mb-2 h-8 w-8 text-[#9d7d4d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            <span className="text-sm font-semibold text-[#5f5648]">Clique para selecionar o arquivo</span>
                            <span className="mt-1 text-xs text-[#7b715f]">KML, KMZ ou GeoJSON</span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".kml,.kmz,.geojson,.json"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </label>

                        {importError && (
                            <p className="mt-3 text-sm text-red-600">{importError}</p>
                        )}

                        {importedFeatures.length > 0 && (
                            <div className="mt-4 space-y-3">
                                <p className="text-sm font-semibold text-[#2f3a2d]">
                                    {importedFeatures.length} polígono(s) encontrado(s). Associe cada um a uma divisão:
                                </p>
                                <div className="max-h-48 space-y-2 overflow-y-auto">
                                    {importedFeatures.map((item, i) => (
                                        <div key={i} className="flex items-center gap-3 rounded-xl border border-[#e2d7c7] bg-[#f6efe3] px-3 py-2">
                                            <span className="min-w-0 flex-1 truncate text-xs text-[#5f5648]">
                                                {(item.feature.properties?.name as string) ?? `Polígono ${i + 1}`}
                                            </span>
                                            <select
                                                value={item.assignedPaddockId}
                                                onChange={(e) => {
                                                    const updated = [...importedFeatures];
                                                    updated[i] = { ...item, assignedPaddockId: e.target.value };
                                                    setImportedFeatures(updated);
                                                }}
                                                className="block w-36 rounded-xl border border-[#d8cbb5] bg-[#fdf9f2] px-2 py-1.5 text-xs text-[#2f3a2d] focus:border-[#9d7d4d] focus:outline-none"
                                            >
                                                <option value="">— ignorar —</option>
                                                {farm.paddocks.map((p) => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => { setShowImport(false); setImportedFeatures([]); setImportError(null); }}
                                className="rounded-xl border border-[#c7b59b] bg-[#f3ebde] px-4 py-2 text-sm font-semibold text-[#5f5648] hover:bg-[#eadfcd]"
                            >
                                Cancelar
                            </button>
                            {importedFeatures.length > 0 && (
                                <button
                                    type="button"
                                    onClick={confirmImport}
                                    className="rounded-xl bg-[#9d7d4d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8f7144]"
                                >
                                    Aplicar geometrias
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const InfoRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
    <div className="flex items-center justify-between text-sm">
        <span className="text-[#6d6558]">{label}</span>
        <span className={`font-semibold ${highlight ? 'text-[#9d7d4d]' : 'text-[#2f3a2d]'}`}>{value}</span>
    </div>
);

const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => (
    <div className="flex items-center gap-1.5">
        <span className="h-3 w-4 rounded-sm border opacity-80" style={{ backgroundColor: color, borderColor: color }} />
        <span className="text-xs text-[#6d6558]">{label}</span>
    </div>
);

export default FarmMap;
