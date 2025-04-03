import React, { useState, useEffect, DragEvent } from "react";
import CircuitVisualizer from "../components/CircuitVisualizer";
import SimplifiedCircuitVisualizer from "../components/SimplifiedCircuitVisualizer";
import "../styles/pages/TeacherPage.css";
import "../styles/common/buttons.css";
import "../styles/common/layout.css";
const API_BASE_URL = "https://two024-2025-project-4-web-fpga-team-2.onrender.com";

// Define type for circuit data
interface Circuit {
  id: string;
  name: string;
  createdAt: string;
  description: string;
  jsonFile: string;
}

function TeacherPage({ onReturn }: { onReturn: () => void }) {
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [selectedCircuit, setSelectedCircuit] = useState<Circuit | null>(null);
  const [circuitName, setCircuitName] = useState<string>("");
  const [circuitDescription, setCircuitDescription] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedCircuits, setSelectedCircuits] = useState<Set<string>>(new Set());
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);


  // Separate state for each file type:
  const [vFile, setVFile] = useState<File | null>(null);
  const [sdfFile, setSdfFile] = useState<File | null>(null);

  // Fetch available circuits on component mount
  useEffect(() => {
    fetchCircuits();
  }, []);

  const fetchCircuits = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/circuits`);
      if (response.ok) {
        const data = await response.json();
        setCircuits(data);
      } else {
        console.error("Failed to fetch circuits");
      }
    } catch (error) {
      console.error("Error fetching circuits:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCircuitSelection = (id: string) => {
    setSelectedCircuits(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      return newSelection;
    });
  };

  const deleteSelectedCircuits = async () => {
    if (selectedCircuits.size === 0) {
      alert("No circuits selected for deletion.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${selectedCircuits.size} selected circuit(s)?`)) {
      return;
    }
    setLoading(true);
    try {
      const deletePromises = Array.from(selectedCircuits).map(id =>
        fetch(`${API_BASE_URL}/circuits/${id}`, { method: "DELETE" })
      );
      const results = await Promise.all(deletePromises);
      const allSuccessful = results.every(res => res.ok);
      if (allSuccessful) {
        setCircuits(circuits.filter(c => !selectedCircuits.has(c.id)));
        if (selectedCircuit && selectedCircuits.has(selectedCircuit.id)) {
          setSelectedCircuit(null);
        }
        setSelectedCircuits(new Set());
        alert("Selected circuits deleted successfully!");
      } else {
        alert("Failed to delete some or all circuits.");
      }
    } catch (error) {
      console.error("Error deleting circuits:", error);
      alert("Failed to delete circuits due to a network error.");
    } finally {
      setLoading(false);
    }
  };

  // File processing helpers:
  function handleSingleFile(file: File) {
    if (file.name.endsWith(".v")) {
      setVFile(file);
    } else if (file.name.endsWith(".sdf")) {
      setSdfFile(file);
    } else {
      alert("File must be .v or .sdf");
    }
  }

  function handleMultipleFiles(fileList: FileList) {
    Array.from(fileList).forEach(file => {
      handleSingleFile(file);
    });
  }

  function removeFile(type: "v" | "sdf") {
    if (type === "v") {
      setVFile(null);
    } else {
      setSdfFile(null);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) return;
    handleMultipleFiles(event.target.files);
    // Reset the input value to allow re-uploading the same file if needed.
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.dataTransfer.files) {
      handleMultipleFiles(event.dataTransfer.files);
    }
  }
  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  // Updated upload logic: require both files.
  const uploadFiles = async () => {
    if (!vFile || !sdfFile) {
      alert("Please upload both a .v file and a .sdf file.");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("vFile", vFile);     // Use different field names
      formData.append("sdfFile", sdfFile);
      formData.append("name", circuitName || `Circuit-${Date.now()}`);
      formData.append("description", circuitDescription || "");

      // Add mode: 'cors' for cross-origin requests
      const response = await fetch(`${API_BASE_URL}/uploads`, {
        method: "POST",
        mode: 'cors',
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to upload files: ${errorData.error}`);
      } else {
        alert("Files uploaded successfully!");
        setVFile(null);
        setSdfFile(null);
        setCircuitName("");
        setCircuitDescription("");
        fetchCircuits();
      }
    } catch (error) {
      console.error("Error uploading files:", error);
      alert("Failed to upload files due to a network error.");
    } finally {
      setLoading(false);
    }
  };

  const deleteCircuit = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this circuit?")) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/circuits/${id}`, { method: "DELETE" });
      if (response.ok) {
        setCircuits(circuits.filter(c => c.id !== id));
        if (selectedCircuit && selectedCircuit.id === id) {
          setSelectedCircuit(null);
        }
        alert("Circuit deleted successfully!");
      } else {
        alert("Failed to delete circuit.");
      }
    } catch (error) {
      console.error("Error deleting circuit:", error);
      alert("Failed to delete circuit due to a network error.");
    } finally {
      setLoading(false);
    }
  };

  const selectCircuit = (circuit: Circuit) => {
    setSelectedCircuit(circuit);
  };

  const approveCircuit = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/approve/${id}`, {
        method: "POST",
      });
      if (response.ok) {
        alert("Circuit approved!");
        fetchCircuits();
      } else {
        alert("Failed to approve circuit.");
      }
    } catch (error) {
      console.error("Error approving circuit:", error);
    }
    setLoading(false);
  };

  const [showSimplified, setShowSimplified] = useState<boolean>(false);

  const prefersDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(prefersDarkMode);

  // Add effect to listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    // Initial check
    setIsDarkTheme(mediaQuery.matches);

    // Add listener
    const handler = (e: MediaQueryListEvent) => setIsDarkTheme(e.matches);
    mediaQuery.addEventListener('change', handler);

    // Clean up
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);


  return (
    <div className={`teacher-page ${isDarkTheme ? 'dark-theme' : 'light-theme'}`}>
      <div className="teacher-header">
        <img
          src={"logoHomeFN.png"}
          alt="Logo"
          className="header-logo"
          onClick={onReturn}
        />
        <h1>Teacher's Dashboard</h1>
        <div className="teacher-burger-menu-container">
          <label className="burger-menu-label">
            <input
              type="checkbox"
              checked={!isSidebarOpen}
              onChange={() => setIsSidebarOpen(!isSidebarOpen)}
              className="burger-menu-input"
            />
            <span className={`burger-menu-span top ${isSidebarOpen ? "closed" : ""}`}></span>
            <span className={`burger-menu-span middle ${isSidebarOpen ? "closed" : ""}`}></span>
            <span className={`burger-menu-span bottom ${isSidebarOpen ? "closed" : ""}`}></span>
          </label>
        </div>
      </div>

      <div className="teacher-page-content">
        {/* Left side - Upload, File Previews, and Circuit List */}
        <div className="teacher-sidebar">
          {/* File Upload Section */}
          <div className="upload-section">
            <h3>Upload New Circuit</h3>

            {/* File Previews */}
            {vFile && (
              <div className="file-preview">
                <span className="file-icon">📄</span>
                <div className="file-name">{vFile.name}</div>
                <button
                  onClick={() => removeFile("v")}
                  className="remove-button"
                  title="Remove file"
                >
                  ✕
                </button>
              </div>
            )}
            {sdfFile && (
              <div className="file-preview">
                <span className="file-icon">📝</span>
                <div className="file-name">{sdfFile.name}</div>
                <button
                  onClick={() => removeFile("sdf")}
                  className="remove-button"
                  title="Remove file"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Show name and description fields ONLY when both files are uploaded */}
            {vFile && sdfFile ? (
              <>
                <div className="form-group">
                  <label htmlFor="circuitName">Circuit Name:</label>
                  <input
                    type="text"
                    id="circuitName"
                    value={circuitName}
                    onChange={(e) => setCircuitName(e.target.value)}
                    className="text-input"
                    placeholder="Enter a name for this circuit"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="circuitDescription">Description (optional):</label>
                  <textarea
                    id="circuitDescription"
                    value={circuitDescription}
                    onChange={(e) => setCircuitDescription(e.target.value)}
                    className="textarea-input"
                    placeholder="Add a description for this circuit"
                  />
                </div>
                <button
                  onClick={uploadFiles}
                  disabled={loading}
                  className="upload-button"
                >
                  {loading ? "Uploading..." : "Upload Files"}
                </button>
              </>
            ) : (
              /* Show drag-drop area when files are missing */
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="drag-drop-area"
              >
                <p>
                  {(!vFile && !sdfFile) && <>Drag and drop your <strong>.v</strong> and <strong>.sdf</strong> files here</>}
                  {(vFile && !sdfFile) && <>Drag and drop your <strong>.sdf</strong> file here</>}
                  {(!vFile && sdfFile) && <>Drag and drop your <strong>.v</strong> file here</>}
                  <span className="or-text">or</span>
                  <label className="choose-files">
                    Choose Files
                    <input
                      type="file"
                      multiple
                      accept=".v,.sdf"
                      onChange={handleFileChange}
                      style={{ display: "none" }}
                    />
                  </label>
                </p>
                <small className="drag-drop-note">
                  {(!vFile && !sdfFile) && "You can select both files at once or upload them separately"}
                  {(vFile && !sdfFile) && "Still needed: one .sdf file"}
                  {(!vFile && sdfFile) && "Still needed: one .v file"}
                </small>
                <small className="drag-drop-note">
                  {(vFile || sdfFile) && "If you select multiple files, existing files will be replaced"}
                </small>
              </div>
            )}
          </div>

          {/* Circuit List Section */}
          <div className="circuit-list-section">
            <div className="circuit-list-header">
              <h3>Available Circuits</h3>
              <button
                onClick={deleteSelectedCircuits}
                disabled={selectedCircuits.size === 0 || loading}
                className="delete-selected-button"
              >
                Delete Selected ({selectedCircuits.size})
              </button>
            </div>
            {loading && <p>Loading circuits...</p>}
            {circuits.length === 0 && !loading ? (
              <p>No circuits available. Upload a new circuit to get started.</p>
            ) : (
              <ul className="circuit-list">
                {circuits.map((circuit) => (
                  <li
                    key={circuit.id}
                    className={`circuit-list-item ${selectedCircuit?.id === circuit.id
                      ? "selected"
                      : selectedCircuits.has(circuit.id)
                        ? "highlight"
                        : ""
                      }`}
                  >
                    <div className="circuit-item-content">
                      <div className="circuit-item-main">
                        <input
                          type="checkbox"
                          checked={selectedCircuits.has(circuit.id)}
                          onChange={() => toggleCircuitSelection(circuit.id)}
                          className="circuit-checkbox"
                        />
                        <div className="circuit-info">
                          <strong className="circuit-name">
                            {circuit.name}
                          </strong>
                          <p className="circuit-date">
                            {new Date(circuit.createdAt).toLocaleString()}
                          </p>
                          {circuit.description && (
                            <p className="circuit-description">
                              {circuit.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="circuit-item-actions">
                        <button onClick={() => selectCircuit(circuit)} className="load-button">
                          Load
                        </button>
                        <button onClick={() => deleteCircuit(circuit.id)} className="delete-button">
                          Delete
                        </button>
                        <button onClick={() => approveCircuit(circuit.id)} className="approve-button">
                          Send
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right side - Circuit Visualization */}
        <div className="circuit-visualization">
          <div className="visualization-container">
            <h3 className="visualization-header">Circuit Visualization</h3>
            {selectedCircuit ? (
              <>
                <div className="current-circuit">
                  <strong>Current Circuit:</strong> {selectedCircuit.name}
                  <button
                    onClick={() => setShowSimplified(!showSimplified)}
                    className="toggle-button"
                    style={{ float: 'right', marginRight: '10px' }}
                  >
                    {showSimplified ? 'Original' : 'Simplified'}
                  </button>
                </div>
                <div className="visualization-area" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <div style={{ marginBottom: '10px' }}>
                    </div>
                    {showSimplified ? (
                      <SimplifiedCircuitVisualizer jsonFile={selectedCircuit.jsonFile} />
                    ) : (
                      <CircuitVisualizer jsonFile={selectedCircuit.jsonFile} />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="no-selection">
                <p>No circuit selected. Please select a circuit from the list.</p>
              </div>
            )}
          </div>
        </div>
        <div className={`teacher-secondary-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
          <div className="secondary-sidebar-header">
            <h3>My Dashboard</h3>
          </div>
          <div className="secondary-sidebar-content">
            {/* Add whatever content you want in this secondary sidebar */}
            <ul className="secondary-menu">
              <li><a href="#">Settings</a></li>
              <li><a href="#">My Classroom</a></li>
              <li><a href="#">Help & Documentation</a></li>
              <li><a href="#">About</a></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeacherPage;
