import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { backendRouter } from "./backend/src/routes/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Cross-Origin headers for DICOM Web & medical imaging viewports
  app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    next();
  });

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
    } catch {}
  }
  app.use('/uploads', express.static(uploadsDir));

  // Mount backend API router
  app.use('/api', backendRouter);

  // Dynamic high-performance proxy routes for mobile/iframe PDF & image downloads
  app.post("/api/download-pdf", (req, res) => {
    try {
      const { pdfData, filename } = req.body;
      if (!pdfData) {
        return res.status(400).send("No pdfData provided.");
      }

      let base64String = pdfData;
      if (pdfData.startsWith("data:")) {
        const parts = pdfData.split(",");
        if (parts.length > 1) {
          base64String = parts[1];
        }
      }

      const pdfBuffer = Buffer.from(base64String, "base64");
      const cleanFilename = String(filename || "report.pdf")
        .replace(/[^a-zA-Z0-9_\-\.\s]/g, "")
        .trim();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${cleanFilename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("PDF proxy download error:", err);
      res.status(500).send("Failed to process download.");
    }
  });

  app.get("/api/download-image", async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      const imageName = req.query.name as string || "image.png";
      
      if (!imageUrl) {
        return res.status(400).send("No url provided.");
      }

      const fetchResponse = await fetch(imageUrl);
      if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch image: ${fetchResponse.statusText}`);
      }

      const arrayBuffer = await fetchResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = fetchResponse.headers.get("content-type") || "image/png";
      const cleanName = String(imageName)
        .replace(/[^a-zA-Z0-9_\-\.\s]/g, "")
        .trim();

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${cleanName}"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (err: any) {
      console.error("Image proxy download error:", err);
      if (req.query.url) {
        return res.redirect(req.query.url as string);
      }
      res.status(500).send("Failed to retrieve image.");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        host: '0.0.0.0',
        port: 3000
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // SPA Fallback for all other routes
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TelePixels Server (Frontend + Backend API) running on http://localhost:${PORT}`);
  });
}

startServer();
