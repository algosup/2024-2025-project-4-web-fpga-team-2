const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://two024-2025-project-4-web-fpga-team-2-4ta1.onrender.com';

app.use(cors({
    origin: [
      'https://ianlaur.github.io',
      'https://two024-2025-project-4-web-fpga-team-2.onrender.com'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Use environment variables with defaults for configuration
const DB_PATH = process.env.DB_PATH || "circuit_data.db";
const UPLOADS_DIR = process.env.UPLOADS_DIR || "uploads";
const DB_CIRCUITS_DIR = process.env.DB_CIRCUITS_DIR || "../database/circuits";

const db = new sqlite3.Database(DB_PATH);

// Ensure necessary directories exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DB_CIRCUITS_DIR)) fs.mkdirSync(DB_CIRCUITS_DIR, { recursive: true });

app.use("/uploads", express.static(path.resolve(UPLOADS_DIR)));
app.use("/database/circuits", express.static(path.resolve(DB_CIRCUITS_DIR)));
app.get('/', (req, res) => {
    res.json({ 
      message: "FPGA Backend API is running",
      endpoints: [
        "/circuits - Get all circuits",
        "/student-circuits - Get approved circuits for students",
        "/upload - Upload new circuit (POST)",
        "/approve/:id - Approve a circuit (POST)",
        "/circuits/:id - Delete a circuit (DELETE)",
        "/ping - Health check"
      ]
    });
  });
// Create circuits table
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS circuits (
            id TEXT PRIMARY KEY,
            name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            json_path TEXT,
            description TEXT
        )
    `);
});

// File Upload Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

const parser = require("./parser");

// WebSocket Communication
wss.on("connection", (ws) => {
    console.log("✅ WebSocket client connected");
    ws.on("close", () => console.log("❌ WebSocket client disconnected"));
});

// Upload Circuit (Temporary Storage)
app.post("/upload", upload.array("files", 2), async (req, res) => {
    if (!req.files || req.files.length !== 2) {
        return res.status(400).json({ error: "Please upload exactly one .v file and one .sdf file." });
    }

    const verilogFile = req.files.find(f => f.originalname.endsWith(".v"));
    const sdfFile = req.files.find(f => f.originalname.endsWith(".sdf"));

    if (!verilogFile || !sdfFile) {
        return res.status(400).json({ error: "Both a Verilog (.v) file and an SDF (.sdf) file are required." });
    }

    const circuitId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    const circuitName = req.body.name || `Circuit-${new Date().toISOString().slice(0, 10)}`;
    const description = req.body.description || "";
    const jsonFilePath = path.join(UPLOADS_DIR, `${circuitId}.json`);

    try {
        const parsedData = parser.analyzeCircuitFiles(
            fs.readFileSync(path.join(UPLOADS_DIR, verilogFile.filename), "utf8"),
            fs.readFileSync(path.join(UPLOADS_DIR, sdfFile.filename), "utf8")
        );

        await parser.generateJsonFile(parsedData, jsonFilePath);

        if (!fs.existsSync(jsonFilePath)) {
            return res.status(500).json({ error: "JSON file not created." });
        }

        db.run(
            "INSERT INTO circuits (id, name, json_path, description) VALUES (?, ?, ?, ?)",
            [circuitId, circuitName, jsonFilePath, description]
        );

        fs.unlinkSync(path.join(UPLOADS_DIR, verilogFile.filename));
        fs.unlinkSync(path.join(UPLOADS_DIR, sdfFile.filename));

        res.json({ message: "Circuit uploaded successfully", id: circuitId, jsonFile: `/uploads/${path.basename(jsonFilePath)}` });

    } catch (error) {
        res.status(500).json({ error: "Failed to process files.", details: error.message });
    }
});

// Approve & Move Circuit to Database Folder
app.post("/approve/:id", (req, res) => {
    const { id } = req.params;

    db.get("SELECT json_path FROM circuits WHERE id = ?", [id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Circuit not found" });

        const sourcePath = row.json_path;
        const destPath = path.join(DB_CIRCUITS_DIR, path.basename(sourcePath));

        // Read the source file and write it to destination (duplicate instead of move)
        fs.readFile(sourcePath, (readErr, data) => {
            if (readErr) return res.status(500).json({ error: "Failed to read source circuit file" });

            fs.writeFile(destPath, data, (writeErr) => {
                if (writeErr) return res.status(500).json({ error: "Failed to duplicate circuit file" });

                db.run("UPDATE circuits SET json_path = ? WHERE id = ?", [destPath, id]);

                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ message: "Circuit approved", id, jsonFile: `../database/circuits/${path.basename(destPath)}` }));
                    }
                });

                res.json({ message: "Circuit approved & duplicated", jsonFile: `../database/circuits/${path.basename(destPath)}` });
            });
        });
    });
});

// Get All Circuits
app.get("/circuits", (req, res) => {
    db.all("SELECT id, name, created_at, json_path, description FROM circuits ORDER BY created_at DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Failed to retrieve circuits" });

        const circuits = rows.map(row => ({
            id: row.id,
            name: row.name,
            createdAt: row.created_at,
            description: row.description,
            jsonFile: row.json_path.includes(DB_CIRCUITS_DIR)
                ? `https://two024-2025-project-4-web-fpga-team-2.onrender.com/database/circuits/${path.basename(row.json_path)}`
                : `https://two024-2025-project-4-web-fpga-team-2.onrender.com/uploads/${path.basename(row.json_path)}`
        }));

        res.json(circuits);
    });
});

// Get Only Approved Circuits for Students
app.get("/student-circuits", (req, res) => {
    db.all("SELECT id, name, created_at, json_path, description FROM circuits WHERE json_path LIKE ?", [`%${DB_CIRCUITS_DIR}%`], (err, rows) => {
        if (err) return res.status(500).json({ error: "Failed to retrieve circuits" });

        const circuits = rows.map(row => ({
            id: row.id,
            name: row.name,
            createdAt: row.created_at,
            description: row.description,
            jsonFile: `https://two024-2025-project-4-web-fpga-team-2.onrender.com/database/circuits/${path.basename(row.json_path)}`
        }));

        res.json(circuits);
    });
});

// Delete Circuit
app.delete("/circuits/:id", (req, res) => {
    const { id } = req.params;

    db.get("SELECT json_path FROM circuits WHERE id = ?", [id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Circuit not found" });

        try {
            // Delete the file at the stored path
            if (fs.existsSync(row.json_path)) {
                fs.unlinkSync(row.json_path);
            }
            
            // Also check if there's a copy in uploads folder
            const basename = path.basename(row.json_path);
            const uploadPath = path.join(UPLOADS_DIR, basename);
            if (fs.existsSync(uploadPath) && uploadPath !== row.json_path) {
                fs.unlinkSync(uploadPath);
            }
        } catch (fileErr) {
            console.error(`[Backend] ❌ Error deleting JSON file:`, fileErr);
        }

        db.run("DELETE FROM circuits WHERE id = ?", [id], (delErr) => {
            if (delErr) return res.status(500).json({ error: "Failed to delete circuit" });

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ message: "Circuit deleted", id }));
                }
            });

            res.json({ message: "Circuit deleted successfully", id });
        });
    });
});


// Health Check
app.get("/ping", (req, res) => res.send("✅ Server is running"));

// Start Server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));