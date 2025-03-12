const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const db = new sqlite3.Database("circuit_data.db");


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

if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
}

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    },
});
const upload = multer({ storage });

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

const parser = require('./parser');

wss.on("connection", (ws) => {
    console.log("✅ New WebSocket client connected");

    ws.on("message", (message) => {
        console.log(`[Backend] 🔄 Received WebSocket message: ${message}`);
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                console.log(`[Backend] 📢 Broadcasting WebSocket message: ${message}`);
                client.send(message);
            }
        });
    });

    ws.on("close", () => console.log("❌ WebSocket client disconnected"));
});

app.post("/upload", upload.array("files", 2), async (req, res) => {
    console.log("[Backend] ✅ Serving JSON files from /uploads/");

    if (!req.files || req.files.length !== 2) {
        return res.status(400).json({ error: "You must upload exactly one .v file and one .sdf file." });
    }

    const verilogFile = req.files.find(file => file.originalname.endsWith(".v"));
    const sdfFile = req.files.find(file => file.originalname.endsWith(".sdf"));

    if (!verilogFile || !sdfFile) {
        return res.status(400).json({ error: "Both a Verilog (.v) file and an SDF (.sdf) file are required." });
    }

    const verilogPath = path.join("uploads", verilogFile.filename);
    const sdfPath = path.join("uploads", sdfFile.filename);
    
    const circuitId = generateUniqueId();
    const circuitName = req.body.name || `Circuit-${new Date().toISOString().slice(0, 10)}`;
    const description = req.body.description || '';

    const jsonFilePath = sdfPath.replace(".sdf", ".json");

    console.log(`[Backend] 📄 Processing Verilog: ${verilogPath}`);
    console.log(`[Backend] 📄 Processing SDF: ${sdfPath}`);

    try {
        // Update this line to use parser.analyzeCircuitFiles
        const parsedData = parser.analyzeCircuitFiles(
            fs.readFileSync(verilogPath, "utf8"), 
            fs.readFileSync(sdfPath, "utf8")
        );
    
        // And update this to use parser.generateJsonFile
        await parser.generateJsonFile(parsedData, jsonFilePath);    

        // ✅ Ensure the JSON file was created before responding
        if (!fs.existsSync(jsonFilePath)) {
            console.error("❌ Error: JSON file not created.");
            return res.status(500).json({ error: "JSON file not created." });
        }

        console.log("[Backend] ✅ JSON file successfully generated!");

        // ✅ Store circuit metadata in the database
        db.run(
            "INSERT INTO circuits (id, name, json_path, description) VALUES (?, ?, ?, ?)",
            [circuitId, circuitName, jsonFilePath, description],
            function(err) {
                if (err) {
                    console.error("[Backend] ❌ Error saving circuit to database:", err);
                } else {
                    console.log(`[Backend] ✅ Circuit saved to database with ID: ${circuitId}`);
                }
            }
        );

        // ✅ Delete the input files after processing
        fs.unlinkSync(verilogPath);
        fs.unlinkSync(sdfPath);
        console.log("[Backend] 🗑️ Input files deleted after processing");

        // ✅ Notify WebSocket clients about the update
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ 
                    message: "Circuit uploaded", 
                    id: circuitId,
                    name: circuitName,
                    jsonFile: `/uploads/${path.basename(jsonFilePath)}` 
                }));
            }
        });

        res.json({ 
            message: "Files processed successfully", 
            id: circuitId,
            name: circuitName,
            jsonFile: `/uploads/${path.basename(jsonFilePath)}` 
        });

    } catch (error) {
        console.error("[Backend] ❌ Error processing files:", error);
        res.status(500).json({ error: "Failed to process files.", details: error.message });
    }
});
// Get all available circuits
app.get("/circuits", (req, res) => {
    db.all("SELECT id, name, created_at, json_path, description FROM circuits ORDER BY created_at DESC", [], (err, rows) => {
        if (err) {
            console.error("[Backend] ❌ Error retrieving circuits:", err);
            return res.status(500).json({ error: "Failed to retrieve circuits" });
        }

        // Map rows to include proper URL paths
        const circuits = rows.map(row => ({
            id: row.id,
            name: row.name,
            createdAt: row.created_at,
            description: row.description,
            jsonFile: `/uploads/${path.basename(row.json_path)}`
        }));

        res.json(circuits);
    });
});

// Get a specific circuit by ID
app.get("/circuits/:id", (req, res) => {
    const { id } = req.params;
    
    db.get("SELECT id, name, created_at, json_path, description FROM circuits WHERE id = ?", [id], (err, row) => {
        if (err) {
            console.error(`[Backend] ❌ Error retrieving circuit ${id}:`, err);
            return res.status(500).json({ error: "Failed to retrieve circuit" });
        }
        
        if (!row) {
            return res.status(404).json({ error: "Circuit not found" });
        }

        res.json({
            id: row.id,
            name: row.name,
            createdAt: row.created_at,
            description: row.description,
            jsonFile: `/uploads/${path.basename(row.json_path)}`
        });
    });
});

app.delete("/circuits/:id", (req, res) => {
    const { id } = req.params;
    
    db.get("SELECT json_path FROM circuits WHERE id = ?", [id], (err, row) => {
        if (err || !row) {
            console.error(`[Backend] ❌ Error finding circuit ${id}:`, err);
            return res.status(err ? 500 : 404).json({ error: err ? "Database error" : "Circuit not found" });
        }
        
        // Delete the JSON file
        try {
            if (fs.existsSync(row.json_path)) {
                fs.unlinkSync(row.json_path);
                console.log(`[Backend] 🗑️ JSON file deleted: ${row.json_path}`);
            }
        } catch (fileErr) {
            console.error(`[Backend] ❌ Error deleting JSON file:`, fileErr);
        }
        
        // Remove from database
        db.run("DELETE FROM circuits WHERE id = ?", [id], function(delErr) {
            if (delErr) {
                console.error(`[Backend] ❌ Error deleting circuit ${id} from database:`, delErr);
                return res.status(500).json({ error: "Failed to delete circuit" });
            }
            
            // Notify WebSocket clients about the deletion
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ 
                        message: "Circuit deleted", 
                        id: id
                    }));
                }
            });
            
            res.json({ message: "Circuit deleted successfully", id: id });
        });
    });
});


// Health check endpoint
app.get("/ping", (req, res) => res.send("✅ Server is running"));


// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
