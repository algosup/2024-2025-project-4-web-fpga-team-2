const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const { extractVerilogInfo, extractSdfInfo, generateJson } = require("./parser");

const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP Server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Create SQLite database for storing circuit data
const db = new sqlite3.Database("circuit_data.db");

// Ensure "uploads" folder exists
if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
}

// Serve static files in the "uploads" directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Configure file upload handling
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    },
});
const upload = multer({ storage });

// WebSocket connection handling
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

// File upload and JSON processing endpoint
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
    const outputJson = path.join("uploads", "parsed_circuit.json");

    console.log(`[Backend] 📄 Processing Verilog: ${verilogPath}`);
    console.log(`[Backend] 📄 Processing SDF: ${sdfPath}`);

    try {
        // ✅ Generate JSON from Verilog and SDF
        await generateJson(verilogPath, sdfPath, outputJson);

        // ✅ Ensure the file is updated before sending response
        if (!fs.existsSync(outputJson)) {
            throw new Error("JSON file not created.");
        }

        console.log("[Backend] ✅ JSON file successfully generated!");

        // ✅ Notify WebSocket clients about the update
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ message: "Circuit updated", jsonFile: `/uploads/parsed_circuit.json` }));
            }
        });

        res.json({ message: "Files processed successfully", jsonFile: `/uploads/parsed_circuit.json` });
    } catch (error) {
        console.error("[Backend] ❌ Error processing files:", error);
        res.status(500).json({ error: "Failed to process files.", details: error.message });
    }
});

// Health check endpoint
app.get("/ping", (req, res) => res.send("✅ Server is running"));

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));