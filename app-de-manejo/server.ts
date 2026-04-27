import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mock database for reports
  const reports: any[] = [];

  // API Route to receive reports
  app.post("/api/reports", (req, res) => {
    const report = req.body;
    console.log("Relatório recebido:", report);
    
    // Simulate processing
    reports.push({
      ...report,
      serverTimestamp: new Date().toISOString(),
      status: 'synced'
    });

    res.status(201).json({ 
      success: true, 
      message: "Relatório sincronizado com sucesso",
      id: report.id 
    });
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", reportsCount: reports.length });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
