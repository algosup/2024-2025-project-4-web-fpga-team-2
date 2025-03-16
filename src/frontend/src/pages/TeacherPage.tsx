import React, { useState, useEffect, DragEvent } from "react";
import CircuitVisualizer from "../components/CircuitVisualizer";

// Define type for circuit data
interface Circuit {
  id: string;
  name: string;
  createdAt: string;
  description: string;
  jsonFile: string;
}

function TeacherPage() {
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [selectedCircuit, setSelectedCircuit] = useState<Circuit | null>(null);
  const [circuitName, setCircuitName] = useState<string>("");
  const [circuitDescription, setCircuitDescription] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedCircuits, setSelectedCircuits] = useState<Set<string>>(new Set());

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
      const response = await fetch("http://localhost:5001/circuits");
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
        fetch(`http://localhost:5001/circuits/${id}`, { method: "DELETE" })
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
      formData.append("files", vFile);
      formData.append("files", sdfFile);
      formData.append("name", circuitName || `Circuit-${new Date().toLocaleString()}`);
      formData.append("description", circuitDescription || "");
      const response = await fetch("http://localhost:5001/upload", {
        method: "POST",
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
      const response = await fetch(`http://localhost:5001/circuits/${id}`, { method: "DELETE" });
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

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      padding: "0",
      margin: "0",
      boxSizing: "border-box",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }}>
      <h1 style={{
        textAlign: "left",
        margin: "10px",
        padding: "10px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        fontSize: "2rem",
      }}>
        Teacher's Dashboard
      </h1>
      <div style={{
        display: "flex",
        width: "100%",
        height: "calc(100vh - 60px)",
        overflow: "hidden",
        padding: "0 10px 10px 10px",
        boxSizing: "border-box"
      }}>
        {/* Left side - Upload, File Previews, and Circuit List */}
        <div style={{
          flex: "1",
          maxWidth: "400px",
          height: "100%",
          overflowY: "auto",
          padding: "0 10px 0 0",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }}>
          {/* File Upload Section */}
            <div style={{
            padding: "20px",
            border: "1px solid #ccc",
            borderRadius: "8px"
            }}>
            <h3 style={{ margin: "0 0 15px 0" }}>Upload New Circuit</h3>
            <div style={{ marginBottom: "10px" }}>
              <label htmlFor="circuitName">Circuit Name:</label>
              <input
              type="text"
              id="circuitName"
              value={circuitName}
              onChange={(e) => setCircuitName(e.target.value)}
              style={{ width: "100%", padding: "8px", marginTop: "5px", boxSizing: "border-box" }}
              placeholder="Enter a name for this circuit"
              />
            </div>
            <div style={{ marginBottom: "10px" }}>
              <label htmlFor="circuitDescription">Description (optional):</label>
              <textarea
              id="circuitDescription"
              value={circuitDescription}
              onChange={(e) => setCircuitDescription(e.target.value)}
              style={{ width: "100%", padding: "8px", marginTop: "5px", minHeight: "80px", boxSizing: "border-box" }}
              placeholder="Add a description for this circuit"
              />
            </div>

            {/* File Previews */}
            {vFile && (
              <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              padding: "6px",
              marginBottom: "10px"
              }}>
              <span style={{ fontSize: "1.5rem" }}>📄</span>
              <div style={{ flex: 1, wordBreak: "break-all" }}>{vFile.name}</div>
              <button
                onClick={() => removeFile("v")}
                style={{
                background: "none",
                border: "none",
                color: "#f44336",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "1.2rem"
                }}
                title="Remove file"
              >
                ✕
              </button>
              </div>
            )}
            {sdfFile && (
              <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              padding: "6px",
              marginBottom: "10px"
              }}>
              <span style={{ fontSize: "1.5rem" }}>📝</span>
              <div style={{ flex: 1, wordBreak: "break-all" }}>{sdfFile.name}</div>
              <button
                onClick={() => removeFile("sdf")}
                style={{
                background: "none",
                border: "none",
                color: "#f44336",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "1.2rem"
                }}
                title="Remove file"
              >
                ✕
              </button>
              </div>
            )}

            {/* Show drag/drop and file input if one or both files are missing */}
            {(!vFile || !sdfFile) && (
              <div 
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              style={{
                marginBottom: "10px",
                padding: "20px",
                border: "2px dashed #aaa",
                borderRadius: "8px",
                textAlign: "center",
                color: "#aaa"
              }}
              >
              <p style={{ margin: 0 }}>
                {(!vFile && !sdfFile) && <>Drag and drop your <strong>.v</strong> and <strong>.sdf</strong> files here</>}
                {(vFile && !sdfFile) && <>Drag and drop your <strong>.sdf</strong> file here</>}
                {(!vFile && sdfFile) && <>Drag and drop your <strong>.v</strong> file here</>}
                <span style={{ margin: "0 5px" }}>or</span>
                <label 
                style={{
                  display: "inline-block",
                  padding: "6px 12px",
                  backgroundColor: "#666",
                  color: "#fff",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
                >
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
              <small style={{ display: "block", marginTop: "10px", color: "#999" }}>
                {(!vFile && !sdfFile) && "You can select both files at once or upload them separately"}
                {(vFile && !sdfFile) && "Still needed: one .sdf file"}
                {(!vFile && sdfFile) && "Still needed: one .v file"}
              </small>
              <small style={{ display: "block", marginTop: "5px", color: "#999" }}>
                {(vFile || sdfFile) && "If you select multiple files, existing files will be replaced"}
              </small>
              </div>
            )}

            {/* Upload Button - only shown when both files are present */}
            {vFile && sdfFile && (
              <button
                onClick={uploadFiles}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  backgroundColor: loading ? "#cccccc" : "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: loading ? "not-allowed" : "pointer",
                  width: "100%"
                }}
              >
                {loading ? "Uploading..." : "Upload Files"}
              </button>
            )}
            </div>

          {/* Circuit List Section */}
          <div style={{
            padding: "20px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            flexGrow: 1,
            overflowY: "auto"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "15px"
            }}>
              <h3 style={{ margin: 0 }}>Available Circuits</h3>
              <button
                onClick={deleteSelectedCircuits}
                disabled={selectedCircuits.size === 0 || loading}
                style={{
                  padding: "5px 10px",
                  backgroundColor: selectedCircuits.size === 0 || loading ? "#cccccc" : "#f44336",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: selectedCircuits.size === 0 || loading ? "not-allowed" : "pointer",
                  fontSize: "0.9rem"
                }}
              >
                Delete Selected ({selectedCircuits.size})
              </button>
            </div>
            {loading && <p>Loading circuits...</p>}
            {circuits.length === 0 && !loading ? (
              <p>No circuits available. Upload a new circuit to get started.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {circuits.map((circuit) => (
                  <li
                    key={circuit.id}
                    style={{
                      padding: "10px",
                      marginBottom: "8px",
                      border: selectedCircuit?.id === circuit.id ? "2px solid #4CAF50" :
                        selectedCircuits.has(circuit.id) ? "2px solid #2196F3" : "1px solid #ddd",
                      borderRadius: "4px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", flex: 1, minWidth: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedCircuits.has(circuit.id)}
                          onChange={() => toggleCircuitSelection(circuit.id)}
                          style={{
                            marginRight: "10px",
                            width: "18px",
                            height: "18px",
                            marginTop: "3px"
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0, paddingRight: "10px" }}>
                          <strong style={{
                            display: "block",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}>
                            {circuit.name}
                          </strong>
                          <p style={{ margin: "5px 0", fontSize: "0.8rem", color: "#666" }}>
                            {new Date(circuit.createdAt).toLocaleString()}
                          </p>
                          {circuit.description && (
                            <p style={{
                              margin: "5px 0",
                              fontSize: "0.9rem",
                              maxHeight: "40px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical"
                            }}>
                              {circuit.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        <button
                          onClick={() => selectCircuit(circuit)}
                          style={{
                            padding: "5px 10px",
                            backgroundColor: "#4CAF50",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            width: "70px"
                          }}
                        >
                          Load
                        </button>
                        <button
                          onClick={() => deleteCircuit(circuit.id)}
                          style={{
                            padding: "5px 10px",
                            backgroundColor: "#f44336",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            width: "70px"
                          }}
                        >
                          Delete
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
        <div style={{
          flex: "3",
          height: "100%",
          overflowY: "hidden"
        }}>
          <div style={{
            height: "100%",
            padding: "20px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column"
          }}>
            <h3 style={{ margin: "0 0 15px 0" }}>Circuit Visualization</h3>
            {selectedCircuit ? (
              <>
                <div style={{ marginBottom: "10px" }}>
                  <strong>Current Circuit:</strong> {selectedCircuit.name}
                </div>
                <div style={{
                  flexGrow: 1,
                  border: "1px solid #ddd",
                  position: "relative",
                  borderRadius: "8px",
                  color: "#333"
                }}>
                  <CircuitVisualizer jsonFile={selectedCircuit.jsonFile} />
                </div>
              </>
            ) : (
              <div style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100%",
                border: "1px solid #ddd"
              }}>
                <p>No circuit selected. Please select a circuit from the list.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeacherPage;