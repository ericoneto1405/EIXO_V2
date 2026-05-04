import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { buildBullDatabase } from './src/lib/dataConstructor.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/bulls', (req, res) => {
    const filePath = path.join(process.cwd(), 'banco_touros.csv');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      res.send(data);
    } else {
      res.status(404).json({ error: 'Banco não encontrado. Execute a atualização.' });
    }
  });

  // Build initial DB if not exists
  const initialPath = path.join(process.cwd(), 'banco_touros.csv');
  if (!fs.existsSync(initialPath)) {
    console.log('Banco inicial não encontrado. Construindo...');
    buildBullDatabase();
  }

  app.post('/api/update-database', async (req, res) => {
    try {
      await buildBullDatabase();
      res.json({ message: 'Base de dados atualizada com sucesso!' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar base.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
