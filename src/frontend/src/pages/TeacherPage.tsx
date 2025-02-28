import React, { useState } from "react";
import CircuitVisualizer from "../../components/CircuitVisualizer";

function TeacherPage() {
  const [files, setFiles] = useState<FileList | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length === 2) {
      const fileList = event.target.files;
      const validFiles = Array.from(fileList).filter(file => 
        file.name.endsWith(".v") || file.name.endsWith(".sdf")
      );
      
      if (validFiles.length === 2) {
        setFiles(fileList);
      } else {
        alert("You must upload exactly one .v file and one .sdf file.");
        setFiles(null);
      }
    } else {
      alert("Please select exactly two files: one .v file and one .sdf file.");
      setFiles(null);
    }
  };

  const uploadFiles = async () => {
    if (!files || files.length !== 2) {
      alert("You must upload exactly one .v file and one .sdf file.");
      return;
    }

    const formData = new FormData();
    Array.from(files).forEach(file => formData.append("files", file));

    const response = await fetch("http://localhost:5001/upload", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      alert("Files uploaded successfully!");
      setFiles(null);
    } else {
      alert("Failed to upload files.");
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Teacher's Dashboard</h1>

      {/* File Upload */}
      <h3>Upload Verilog (.v) & SDF (.sdf) Files</h3>
      <input type="file" multiple accept=".v,.sdf" onChange={handleFileChange} />
      <button onClick={uploadFiles} disabled={!files || files.length !== 2}>Upload Files</button>

      {/* Circuit Visualization */}
      <div style={{ width: "80vw", height: "80vh", overflow: "hidden", border: "1px solid white" }}>
        <CircuitVisualizer />
      </div>
    </div>
  );
}

export default TeacherPage;
