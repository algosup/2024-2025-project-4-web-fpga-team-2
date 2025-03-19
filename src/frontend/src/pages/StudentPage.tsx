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

function StudentPage() {
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [selectedCircuit, setSelectedCircuit] = useState<Circuit | null>(null);
  const [circuitName, setCircuitName] = useState<string>("");
  const [circuitDescription, setCircuitDescription] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedCircuits, setSelectedCircuits] = useState<Set<string>>(new Set());
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);


  // Fetch available circuits on component mount
  useEffect(() => {
    fetchCircuits();
  }, []);

  const fetchCircuits = async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:5001/student-circuits");
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
        Student's Circuit Page
      </h1>
      <div style={{
        display: "flex",
        width: "100%",
        height: "calc(100vh - 60px)",
        overflow: "hidden",
        padding: "0 10px 10px 10px",
        boxSizing: "border-box"
      }}>
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
            {selectedCircuit ? (
              <>
                  {/* <strong style={{
                    position: "relative",
                    top: "10px",
                    left: "10px",
                    padding: "8px",
                    backgroundColor: "#4CAF50",
                    color: "white",
                    borderRadius: "4px"
                  }}>
                    {selectedCircuit.name}
                  </strong> */}
                  <CircuitVisualizer jsonFile={selectedCircuit.jsonFile} />
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

        {/* Left side - Upload, File Previews, and Circuit List */}
        <>
          {/* Burger Menu Button */}
          <div style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            scale: "0.6",
            zIndex: 200
          }}>
            <label className="bar" style={{
              display: "block",
              position: "relative",
              cursor: "pointer",
              width: "50px",
              height: "40px"
            }}>
              <input 
                type="checkbox"
                checked={!isSidebarOpen}
                onChange={() => setIsSidebarOpen(!isSidebarOpen)}
                style={{
                  WebkitAppearance: "none",
                  display: "none",
                  visibility: "hidden"
                }}
              />
              <span className="top" style={{
                position: "absolute",
                width: isSidebarOpen ? "48px" : "45px",
                height: "7px",
                background: "#ffffff",
                borderRadius: "100px",
                display: "inline-block",
                transition: "0.3s ease",
                left: isSidebarOpen ? "5px" : "0",
                top: "0",
                transform: isSidebarOpen ? "rotate(45deg)" : "none",
                transformOrigin: "top left"
              }}></span>
              <span className="middle" style={{
                position: "absolute",
                width: "45px",
                height: "7px",
                background: "#ffffff",
                borderRadius: "100px",
                display: "inline-block",
                transition: "0.3s ease",
                left: "0",
                top: "17px",
                transform: isSidebarOpen ? "translateX(-20px)" : "none",
                opacity: isSidebarOpen ? "0" : "1"
              }}></span>
              <span className="bottom" style={{
                position: "absolute",
                width: isSidebarOpen ? "48px" : "45px",
                height: "7px",
                background: "#ffffff",
                borderRadius: "100px",
                display: "inline-block",
                transition: "0.3s ease",
                left: "0",
                bottom: isSidebarOpen ? "-1px" : "0",
                transform: isSidebarOpen ? "rotate(-45deg)" : "none",
                transformOrigin: "top left",
              }}></span>
            </label>
          </div>

          {/* Left side panel - Only visible when sidebar is open */}
          <div style={{
            flex: isSidebarOpen ? "1" : "0",
            maxWidth: isSidebarOpen ? "400px" : "0",
            height: "100%",
            overflowY: "auto",
            padding: isSidebarOpen ? "0 10px 0 0" : "0",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            transition: "all 0.3s ease-in-out",
            opacity: isSidebarOpen ? 1 : 0,
            visibility: isSidebarOpen ? "visible" : "hidden"
          }}>
            {isSidebarOpen && (
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
                    onClick={fetchCircuits}
                    style={{
                      padding: "5px 10px",
                      backgroundColor: "#2196F3",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px"
                    }}
                  >
                    <span>Refresh</span>
                    {loading && <span style={{ width: "12px", height: "12px" }}>↻</span>}
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
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      </div>
      
    </div>
    
  );
}

export default StudentPage;