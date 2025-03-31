import React, { useState, useEffect } from "react";
import CircuitVisualizer from "../components/CircuitVisualizer";
import "../styles/pages/StudentPage.css";

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
    <div className="student-page--container">
      <h1 className="student-page--header">
        Student's Circuit Page
      </h1>
      <div className="student-page--content">
        {/* Right side - Circuit Visualization */}
        <div className="student-page--visualizer-wrapper">
          <div className="student-page--visualizer-container">
            {selectedCircuit ? (
              <>
                <CircuitVisualizer jsonFile={selectedCircuit.jsonFile} />
              </>
            ) : (
              <div className="student-page--empty-state">
                <p>No circuit selected. Please select a circuit from the list.</p>
              </div>
            )}
          </div>
        </div>

        {/* Left side - Upload, File Previews, and Circuit List */}
        <>
          {/* Burger Menu Button */}
          <div className="student-page--burger-menu-container">
            <label className="burger-menu-label">
              <input 
                type="checkbox"
                checked={!isSidebarOpen}
                onChange={() => setIsSidebarOpen(!isSidebarOpen)}
                className="burger-menu-input"
              />
              <span className={`burger-menu-span top ${isSidebarOpen ? "open" : "closed"}`}></span>
              <span className={`burger-menu-span middle ${isSidebarOpen ? "open" : "closed"}`}></span>
              <span className={`burger-menu-span bottom ${isSidebarOpen ? "open" : "closed"}`}></span>
            </label>
          </div>

          {/* Left side panel */}
          <div className={`student-page--sidebar ${isSidebarOpen ? "open" : "closed"}`}>
            {isSidebarOpen && (
              <div className="student-page--sidebar-content">
                <div className="student-page--sidebar-header">
                  <h3>Available Circuits</h3>
                  <button onClick={fetchCircuits} className="student-page--refresh-btn">
                    <span>Refresh</span>
                    {loading && <span className="loading-icon">↻</span>}
                  </button>
                </div>
                {loading && <p>Loading circuits...</p>}
                {circuits.length === 0 && !loading ? (
                  <p>No circuits available. Upload a new circuit to get started.</p>
                ) : (
                  <ul className="student-page--circuits-list">
                    {circuits.map((circuit) => (
                      <li
                        key={circuit.id}
                        className="student-page--circuit-item"
                      >
                        <div className="student-page--circuit-item-container">
                          <div className="student-page--circuit-info">
                            <div className="student-page--circuit-info-inner">
                              <strong className="student-page--circuit-name">
                                {circuit.name}
                              </strong>
                              <p className="student-page--circuit-date">
                                {new Date(circuit.createdAt).toLocaleString()}
                              </p>
                              {circuit.description && (
                                <p className="student-page--circuit-description">
                                  {circuit.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="student-page--circuit-actions">
                            <button
                              onClick={() => selectCircuit(circuit)}
                              className="student-page--load-btn"
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