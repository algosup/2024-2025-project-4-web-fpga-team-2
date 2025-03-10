import { useState } from "react";
import TeacherPage from "./pages/TeacherPage";
import StudentPage from "./pages/StudentPage";

function App() {
  const [role, setRole] = useState<"teacher" | "student" | null>(null);
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  const handleTeacherLogin = () => {
    if (password === "securepass") { // Change this password as needed
      setRole("teacher");
    } else {
      alert("Incorrect password!");
    }
  };

  const handleStudentLogin = () => {
    if (username.trim() !== "") {
      setRole("student");
    } else {
      alert("Please enter a username.");
    }
  };

  if (role === "teacher") return <TeacherPage />;
  if (role === "student") return <StudentPage username={username} />;

  return (
    <div style={{ textAlign: "center", marginTop: "50px", backgroundColor: "#222", color: "white", height: "100vh", width: "100vw" }}>
      <h1>Welcome to PWA Education App</h1>
      <h2>Select Your Role</h2>

      {/* Teacher Login */}
      <div style={{ marginBottom: "20px" }}>
        <h3>Teacher Login</h3>
        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={handleTeacherLogin}>Enter</button>
      </div>

      {/* Student Login */}
      <div>
        <h3>Student Login</h3>
        <input
          type="text"
          placeholder="Enter username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button onClick={handleStudentLogin}>Enter</button>
      </div>
    </div>
  );
}

export default App;
