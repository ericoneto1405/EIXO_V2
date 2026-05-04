import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  Database, 
  Download, 
  FileSpreadsheet, 
  ShieldCheck, 
  Star, 
  TrendingUp, 
  Users, 
  ChevronRight,
  AlertTriangle,
  RefreshCcw,
  Search,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

// --- Types ---
interface Touro {
  nome_touro: string;
  registro_touro: string;
  raca: string;
  central: string;
  dep_peso_nascer: number;
  dep_peso_desmama: number;
  dep_ganho_pos_desmama: number;
  dep_peso_sobreano: number;
  dep_area_olho_lombo: number;
  dep_espessura_gordura: number;
  dep_marmoreio: number;
  dep_precocidade: number;
  dep_habilidade_maternal: number;
  ac_peso_desmama: number;
  ac_peso_sobreano: number;
  ac_area_olho_lombo: number;
  score?: number;
}

interface Lote {
  lote: string;
  quantidade_cabecas: number;
  peso_medio: number;
}

type Estrategia = 'Vender Bezerro' | 'Ciclo Completo' | 'Fazer Matrizes' | 'Cruzamento F1 Premium';

// --- Utils ---
const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');

export default function App() {
  const [bulls, setBulls] = useState<Touro[]>([]);
  const [loading, setLoading] = useState(true);
  const [estrategia, setEstrategia] = useState<Estrategia>('Vender Bezerro');
  const [racaBase, setRacaBase] = useState('Nelore');
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [updating, setUpdating] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCentrais, setSelectedCentrais] = useState<string[]>([]);
  const [selectedBullForAudit, setSelectedBullForAudit] = useState<string | null>(null);
  const [selectedBullForDetails, setSelectedBullForDetails] = useState<string | null>(null);

  // --- Initial Load ---
  const fetchBulls = async () => {
    try {
      const response = await fetch('/api/bulls');
      if (response.ok) {
        const text = await response.text();
        const rows = text.split('\n').filter(r => r.trim()).slice(1);
        const parsed = rows.map(row => {
          const cols = row.split(',');
          return {
            nome_touro: cols[0],
            registro_touro: cols[1],
            raca: cols[2],
            central: cols[3],
            dep_peso_nascer: parseFloat(cols[4]) || 0,
            dep_peso_desmama: parseFloat(cols[5]) || 0,
            dep_ganho_pos_desmama: parseFloat(cols[6]) || 0,
            dep_peso_sobreano: parseFloat(cols[7]) || 0,
            dep_area_olho_lombo: parseFloat(cols[8]) || 0,
            dep_espessura_gordura: parseFloat(cols[9]) || 0,
            dep_marmoreio: parseFloat(cols[10]) || 0,
            dep_precocidade: parseFloat(cols[11]) || 0,
            dep_habilidade_maternal: parseFloat(cols[12]) || 0,
            ac_peso_desmama: parseFloat(cols[13]) || 0.5,
            ac_peso_sobreano: parseFloat(cols[14]) || 0.5,
            ac_area_olho_lombo: parseFloat(cols[15]) || 0.5,
          };
        });
        setBulls(parsed);
      }
    } catch (error) {
      console.error('Falha ao carregar touros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBulls();
  }, []);

  const runMonthlyUpdate = async () => {
    setUpdating(true);
    await fetch('/api/update-database', { method: 'POST' });
    await fetchBulls();
    setUpdating(false);
    alert('Base de dados atualizada com sucesso!');
  };

  // --- Logic ---
  const availableCentrais = useMemo(() => {
    const unique = Array.from(new Set(bulls.map(b => b.central)));
    return unique.sort();
  }, [bulls]);

  const topMatches = useMemo(() => {
    if (!lotes.length || !bulls.length) return [];

    const averageWeight = lotes.reduce((acc, l) => acc + l.peso_medio, 0) / lotes.length;
    
    let filtered = bulls.filter(b => {
      // Prioridade: Busca por Nome ou Registro
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        return b.nome_touro.toLowerCase().includes(term) || b.registro_touro.toLowerCase().includes(term);
      }

      // Filtro de Raça Base
      if (estrategia === 'Cruzamento F1 Premium') {
        if (!['Angus', 'Brangus', 'Braford'].includes(b.raca)) return false;
      } else {
        if (b.raca.toLowerCase() !== racaBase.toLowerCase()) return false;
      }

      // Filtro de Centrais
      if (selectedCentrais.length > 0) {
        if (!selectedCentrais.includes(b.central)) return false;
      }

      return true;
    });

    // Trava de Novilhas
    if (averageWeight < 350) {
      filtered = filtered.filter(b => b.dep_peso_nascer < 0);
    }

    const scored = filtered.map(b => {
      let score = 0;
      if (estrategia === 'Vender Bezerro') {
        score = b.dep_peso_desmama * 1.0 * b.ac_peso_desmama;
      } else if (estrategia === 'Ciclo Completo') {
        score = (b.dep_peso_sobreano * 0.5 * b.ac_peso_sobreano) + (b.dep_area_olho_lombo * 0.5 * b.ac_area_olho_lombo);
      } else if (estrategia === 'Fazer Matrizes') {
        score = (b.dep_habilidade_maternal * 0.6) + (b.dep_precocidade * 0.4);
      } else if (estrategia === 'Cruzamento F1 Premium') {
        score = (b.dep_peso_desmama * 0.5 * b.ac_peso_desmama) + (b.dep_marmoreio * 0.5);
      }
      return { ...b, score };
    });

    return scored.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
  }, [bulls, lotes, estrategia, racaBase]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError(null);
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws) as any[];

          if (data.length === 0) {
            throw new Error("A planilha está vazia.");
          }

          const requiredCols = ['lote', 'quantidade_cabecas', 'peso_medio'];
          const firstRow = data[0];
          const missingCols = requiredCols.filter(col => !(col in firstRow));

          if (missingCols.length > 0) {
            throw new Error(`Colunas obrigatórias faltando: ${missingCols.join(', ')}`);
          }

          const validatedData = data.map((item, index) => {
            const rowNum = index + 2;
            const q = Number(item.quantidade_cabecas);
            const p = Number(item.peso_medio);

            if (isNaN(q) || q <= 0) {
              throw new Error(`Linha ${rowNum}: 'quantidade_cabecas' inválida.`);
            }
            if (isNaN(p) || p <= 0) {
              throw new Error(`Linha ${rowNum}: 'peso_medio' inválido.`);
            }

            return {
              lote: String(item.lote),
              quantidade_cabecas: q,
              peso_medio: p
            } as Lote;
          });

          setLotes(validatedData);
          setUploadError(null);
        } catch (err: any) {
          setUploadError(err.message);
          setLotes([]);
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  const downloadTemplate = () => {
    const data = [{ lote: 'LOTE 01', quantidade_cabecas: 50, peso_medio: 320 }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    XLSX.writeFile(wb, 'modelo_acasalamento.xlsx');
  };

  const getStars = (acc: number) => {
    if (acc >= 0.8) return 5;
    if (acc >= 0.65) return 4;
    return 3;
  };

  const auditarProgenieOficial = (bull: Touro) => {
    // Mock Auditoria
    const associacao = ['Nelore', 'Tabapuã', 'Guzerá'].includes(bull.raca) ? "ABCZ" : 
                    bull.raca === 'Angus' ? "AAA" : "Programa Natura";
    
    const depPrometida = estrategia === 'Vender Bezerro' ? bull.dep_peso_desmama : bull.dep_peso_sobreano;
    const performanceFilhosFactor = 0.6 + (Math.random() * 0.5); // 60% a 110%
    const mediaFilhos = depPrometida * performanceFilhosFactor;
    const isValidated = performanceFilhosFactor >= 0.8;

    return {
      associacao,
      mediaFilhos: mediaFilhos.toFixed(2),
      isValidated,
      percent: (performanceFilhosFactor * 100).toFixed(0)
    };
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans text-slate-800">
      {/* Sidebar Premium */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm">
        <div className="p-8">
          <div className="flex items-center gap-2 mb-8 select-none">
            <div className="text-3xl font-black tracking-tighter text-slate-900">EI</div>
            <div className="relative">
              <div className="text-3xl font-black tracking-tighter text-slate-900">X</div>
              <div className="absolute top-0 right-[-10px] w-2 h-full bg-[#A3E635] skew-x-[20deg] opacity-80"></div>
            </div>
            <div className="text-3xl font-black tracking-tighter text-slate-900">O</div>
          </div>
          
          <nav className="space-y-6">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 block">
                Estratégia de Acasalamento
              </label>
              <div className="space-y-1">
                {(['Vender Bezerro', 'Ciclo Completo', 'Fazer Matrizes', 'Cruzamento F1 Premium'] as Estrategia[]).map((strat) => (
                  <button
                    key={strat}
                    onClick={() => setEstrategia(strat)}
                    className={cn(
                      "w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all duration-200 flex items-center justify-between group",
                      estrategia === strat 
                        ? "bg-slate-900 text-white shadow-lg" 
                        : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {strat}
                    <ChevronRight className={cn("w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity", estrategia === strat && "opacity-100")} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 block">
                Raça Base (Matrizes)
              </label>
              <select 
                value={racaBase}
                onChange={(e) => setRacaBase(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-200 mb-6"
              >
                {['Nelore', 'Anelorado', 'Mestiço', 'Tabapuã'].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 block">
                Filtrar Centrais
              </label>
              <div className="max-h-48 overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-200">
                {availableCentrais.map(central => (
                  <label key={central} className="flex items-center gap-3 group cursor-pointer">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedCentrais.includes(central)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCentrais([...selectedCentrais, central]);
                          } else {
                            setSelectedCentrais(selectedCentrais.filter(c => c !== central));
                          }
                        }}
                        className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-slate-200 bg-white transition-all checked:bg-slate-900 checked:border-slate-900 focus:outline-none"
                      />
                      <svg
                        className="absolute h-3.5 w-3.5 pointer-events-none hidden peer-checked:block text-white left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                      {central}
                    </span>
                  </label>
                ))}
              </div>
              {selectedCentrais.length > 0 && (
                <button 
                  onClick={() => setSelectedCentrais([])}
                  className="mt-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider hover:text-emerald-700 transition-colors"
                >
                  Limpar Seleção
                </button>
              )}
            </div>
          </nav>
        </div>

        <div className="mt-auto p-8 border-t border-slate-100">
          <button 
            onClick={runMonthlyUpdate}
            disabled={updating}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            <RefreshCcw className={cn("w-4 h-4", updating && "animate-spin")} />
            {updating ? 'Atualizando...' : 'Atualização Mensal'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-12">
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight mb-2">EIXO Acasalamento</h1>
            <p className="text-slate-500 font-medium">Arquitetura Zootécnica para Lucratividade Máxima.</p>
          </div>
          
          <div className="flex gap-4">
            {uploadError && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100"
              >
                <AlertTriangle className="w-4 h-4" />
                {uploadError}
              </motion.div>
            )}
            <button 
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:shadow-md transition-shadow"
            >
              <Download className="w-4 h-4" />
              Planilha Modelo
            </button>
            <label className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 rounded-xl text-sm font-bold text-white hover:bg-slate-800 cursor-pointer shadow-lg shadow-slate-200 transition-all">
              <Upload className="w-4 h-4" />
              Subir Lote
              <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
            </label>
          </div>
        </header>

        {/* Search Bar Area */}
        <div className="mb-10 relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Procurar touro por nome ou registro (ex: REG-12345)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium shadow-sm focus:ring-4 focus:ring-slate-100 focus:border-slate-300 outline-none transition-all"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              LIMPAR
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <RefreshCcw className="w-8 h-8 animate-spin mb-4" />
            <p>Carregando base de touros...</p>
          </div>
        ) : lotes.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-24 text-center"
          >
            <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileSpreadsheet className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Aguardando Dados do Lote</h2>
            <p className="text-slate-500 max-w-md mx-auto mb-8">
              Faça upload da planilha contendo os lotes para que o sistema execute o cruzamento genético avançado.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-12">
            {/* Summary Row */}
            <div className="grid grid-cols-3 gap-8">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total de Cabeças</p>
                <p className="text-3xl font-black text-slate-900">{lotes.reduce((a, b) => a + b.quantidade_cabecas, 0)}</p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Peso Médio Global</p>
                <p className="text-3xl font-black text-slate-900">{(lotes.reduce((a, b) => a + b.peso_medio, 0) / lotes.length).toFixed(1)} kg</p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Status de Novilhas</p>
                {lotes.some(l => l.peso_medio < 350) ? (
                  <p className="text-3xl font-black text-amber-500">Trava de Parto Ativa</p>
                ) : (
                  <p className="text-3xl font-black text-emerald-500">Multíparas / Peso OK</p>
                )}
              </div>
            </div>

            {/* Top 3 Result Cards */}
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                Top 3 Matches Recomendados
              </h3>
              
              <div className="grid grid-cols-3 gap-8">
                {topMatches.map((bull, idx) => (
                  <motion.div
                    key={bull.nome_touro}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-xl shadow-slate-100 relative overflow-hidden group"
                  >
                    <div className="absolute top-0 right-0 p-4">
                      {idx === 0 && <div className="bg-amber-100 text-amber-700 text-[10px] font-black uppercase px-3 py-1 rounded-full">Melhor Opção</div>}
                    </div>

                    <div className="mb-6">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{bull.central} • {bull.raca}</span>
                      <h4 className="text-2xl font-black text-slate-900 leading-tight mt-1">{bull.nome_touro}</h4>
                    </div>

                    <div className="space-y-4 mb-8">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">Acurácia Desmama:</span>
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className={cn("w-3 h-3", i < getStars(bull.ac_peso_desmama) ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200")} />
                          ))}
                        </div>
                      </div>
                      
                      <div className="bg-slate-50 p-4 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Justificativa Zootech</p>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {estrategia === 'Vender Bezerro' && "Alta DEP de Desmama combinada com acurácia comercial."}
                          {estrategia === 'Ciclo Completo' && "Equilíbrio entre carcaça (AOL) e peso ao sobreano."}
                          {estrategia === 'Fazer Matrizes' && "Foco em habilidade maternal e precocidade sexual (PE)."}
                          {estrategia === 'Cruzamento F1 Premium' && "Base Angus/Brangus para qualidade de carne e marmoreio."}
                        </p>
                      </div>
                    </div>

                    {/* Button actions */}
                    <div className="flex gap-2">
                       <button 
                        onClick={() => {
                          setSelectedBullForAudit(selectedBullForAudit === bull.nome_touro ? null : bull.nome_touro);
                          setSelectedBullForDetails(null);
                        }}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold text-xs transition-all duration-200",
                          selectedBullForAudit === bull.nome_touro 
                            ? "bg-slate-900 text-white" 
                            : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                        )}
                        title="Auditar Progênie Oficial"
                      >
                        <Search className="w-4 h-4" />
                        Auditar
                      </button>

                      <button 
                        onClick={() => {
                          setSelectedBullForDetails(selectedBullForDetails === bull.nome_touro ? null : bull.nome_touro);
                          setSelectedBullForAudit(null);
                        }}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold text-xs transition-all duration-200",
                          selectedBullForDetails === bull.nome_touro 
                            ? "bg-slate-900 text-white" 
                            : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                        )}
                        title="Ver todas as DEPs e Acurácias"
                      >
                        <Database className="w-4 h-4" />
                        Detalhes
                      </button>
                    </div>

                    <AnimatePresence>
                      {selectedBullForDetails === bull.nome_touro && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="mt-4 pt-4 border-t border-slate-100 overflow-hidden"
                        >
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <div className="bg-slate-50 p-2 rounded-xl">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">DEP Nascimento</p>
                              <p className={cn("text-xs font-black", bull.dep_peso_nascer < 0 ? "text-emerald-600" : "text-slate-900")}>
                                {bull.dep_peso_nascer > 0 ? `+${bull.dep_peso_nascer}` : bull.dep_peso_nascer} kg
                              </p>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-xl">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">DEP Desmama</p>
                              <p className="text-xs font-black text-slate-900">+{bull.dep_peso_desmama} kg</p>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-xl">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">DEP Sobreano</p>
                              <p className="text-xs font-black text-slate-900">+{bull.dep_peso_sobreano} kg</p>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-xl">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">DEP AOL</p>
                              <p className="text-xs font-black text-slate-900">+{bull.dep_area_olho_lombo} cm²</p>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-xl">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">DEP Marmoreio</p>
                              <p className="text-xs font-black text-slate-900">+{bull.dep_marmoreio}%</p>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-xl">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">DEP Precocidade</p>
                              <p className="text-xs font-black text-slate-900">+{bull.dep_precocidade} cm</p>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-xl">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Habil. Maternal</p>
                              <p className="text-xs font-black text-slate-900">+{bull.dep_habilidade_maternal} kg</p>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-xl">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Registro</p>
                              <p className="text-xs font-black text-slate-900">{bull.registro_touro}</p>
                            </div>
                          </div>
                          
                          <div className="mt-4 space-y-2">
                             <div className="flex justify-between items-center text-[10px]">
                               <span className="text-slate-400 font-bold uppercase">Acurácia Desmama:</span>
                               <span className="text-slate-900 font-black">{(bull.ac_peso_desmama * 100).toFixed(0)}%</span>
                             </div>
                             <div className="flex justify-between items-center text-[10px]">
                               <span className="text-slate-400 font-bold uppercase">Acurácia Sobreano:</span>
                               <span className="text-slate-900 font-black">{(bull.ac_peso_sobreano * 100).toFixed(0)}%</span>
                             </div>
                             <div className="flex justify-between items-center text-[10px]">
                               <span className="text-slate-400 font-bold uppercase">Acurácia AOL:</span>
                               <span className="text-slate-900 font-black">{(bull.ac_area_olho_lombo * 100).toFixed(0)}%</span>
                             </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {selectedBullForAudit === bull.nome_touro && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="mt-4 pt-4 border-t border-slate-100 overflow-hidden"
                        >
                          {(() => {
                            const audit = auditarProgenieOficial(bull);
                            return (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-slate-400 font-bold uppercase">Associação:</span>
                                  <span className="text-slate-900 font-black">{audit.associacao}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-slate-400 font-bold uppercase">Média Progênie:</span>
                                  <span className="text-slate-900 font-black">{audit.mediaFilhos}</span>
                                </div>
                                <div className={cn(
                                  "p-3 rounded-xl flex items-center gap-3",
                                  audit.isValidated ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                                )}>
                                  {audit.isValidated ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                                  <div>
                                    <p className="text-[10px] font-black uppercase">Veredito</p>
                                    <p className="text-[11px] font-bold">{audit.isValidated ? "✅ Validado pela Progênie" : "⚠️ Alerta: Catálogo não sustentou"}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
