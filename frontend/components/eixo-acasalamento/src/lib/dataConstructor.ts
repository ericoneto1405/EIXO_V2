import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import path from 'path';

export interface Touro {
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
  dep_precocidade: number; // PE
  dep_habilidade_maternal: number;
  ac_peso_desmama: number;
  ac_peso_sobreano: number;
  ac_area_olho_lombo: number;
}

const CENTRAIS = ['Alta', 'ABS', 'CRV', 'Select Sires', 'Semex', 'Genex', 'Tairana', 'Renascer'];
const RACAS_CORTE = ['Angus', 'Brangus', 'Braford', 'Nelore', 'Tabapuã', 'Guzerá', 'Senepol', 'Hereford'];

export async function buildBullDatabase() {
  console.log('Iniciando construção da base de dados...');
  const bulls: Touro[] = [];

  try {
    // Simulando Web Scraping de 8 centrais
    // Para um MVP real, cada central precisaria de um parser específico
    // Aqui implementamos a lógica de fallback e semente de dados realista
    for (let i = 0; i < 50; i++) {
        bulls.push(generateMockBull(i));
    }

    const csvContent = [
      'nome_touro,registro_touro,raca,central,dep_peso_nascer,dep_peso_desmama,dep_ganho_pos_desmama,dep_peso_sobreano,dep_area_olho_lombo,dep_espessura_gordura,dep_marmoreio,dep_precocidade,dep_habilidade_maternal,ac_peso_desmama,ac_peso_sobreano,ac_area_olho_lombo',
      ...bulls.map(b => [
        b.nome_touro,
        b.registro_touro,
        b.raca,
        b.central,
        b.dep_peso_nascer,
        b.dep_peso_desmama,
        b.dep_ganho_pos_desmama,
        b.dep_peso_sobreano,
        b.dep_area_olho_lombo,
        b.dep_espessura_gordura,
        b.dep_marmoreio,
        b.dep_precocidade,
        b.dep_habilidade_maternal,
        b.ac_peso_desmama,
        b.ac_peso_sobreano,
        b.ac_area_olho_lombo
      ].join(','))
    ].join('\n');

    const filePath = path.join(process.cwd(), 'banco_touros.csv');
    fs.writeFileSync(filePath, csvContent);
    console.log('Banco de touros criado com sucesso em:', filePath);
    return bulls;
  } catch (error) {
    console.error('Erro no scraping, executando mock_build():', error);
    return mockBuild();
  }
}

function generateMockBull(index: number): Touro {
  const central = CENTRAIS[Math.floor(Math.random() * CENTRAIS.length)];
  const raca = RACAS_CORTE[Math.floor(Math.random() * RACAS_CORTE.length)];
  const prefixo = ['REI', 'BRUTO', 'ALVO', 'TITÃ', 'FORTE', 'OURO', 'TOP'][Math.floor(Math.random() * 7)];
  
  return {
    nome_touro: `${prefixo} ${index + 100} DA ${central.toUpperCase()}`,
    registro_touro: `REG-${Math.floor(10000 + Math.random() * 90000)}`,
    raca,
    central,
    dep_peso_nascer: parseFloat((Math.random() * 4 - 1.5).toFixed(2)), // -1.5 a 2.5
    dep_peso_desmama: parseFloat((Math.random() * 20 - 5).toFixed(2)),
    dep_ganho_pos_desmama: parseFloat((Math.random() * 15).toFixed(2)),
    dep_peso_sobreano: parseFloat((Math.random() * 30).toFixed(2)),
    dep_area_olho_lombo: parseFloat((Math.random() * 5).toFixed(2)),
    dep_espessura_gordura: parseFloat((Math.random() * 3 - 1).toFixed(2)),
    dep_marmoreio: parseFloat((Math.random() * 2).toFixed(2)),
    dep_precocidade: parseFloat((Math.random() * 2).toFixed(2)),
    dep_habilidade_maternal: parseFloat((Math.random() * 10 - 2).toFixed(2)),
    ac_peso_desmama: parseFloat((0.4 + Math.random() * 0.55).toFixed(2)),
    ac_peso_sobreano: parseFloat((0.4 + Math.random() * 0.55).toFixed(2)),
    ac_area_olho_lombo: parseFloat((0.4 + Math.random() * 0.55).toFixed(2))
  };
}

export function mockBuild() {
  const bulls: Touro[] = [];
  for (let i = 0; i < 50; i++) {
    bulls.push(generateMockBull(i));
  }
  return bulls;
}
