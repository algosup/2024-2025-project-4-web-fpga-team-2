import { useState, useEffect } from "react";
import TeacherPage from "./pages/TeacherPage";
import StudentPage from "./pages/StudentPage";
import "./styles/App.css";
import "./styles/common/layout.css";

function App() {
  const [role, setRole] = useState<"teacher" | "student" | null>(null);
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [activeTab, setActiveTab] = useState<"teacher" | "student">("student");

  // Theme detection - same as TeacherPage
  const prefersDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(prefersDarkMode);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkTheme(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsDarkTheme(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const handleTeacherLogin = () => {
    if (password === "securepass") {
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

  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent, role: "teacher" | "student") => {
    if (e.key === "Enter") {
      role === "teacher" ? handleTeacherLogin() : handleStudentLogin();
    }
  };

  if (role === "teacher") return <TeacherPage onReturn={() => setRole(null)} />;
  if (role === "student") return <StudentPage username={username} onReturn={() => setRole(null)} />;
  return (
    <div className={`app-container ${isDarkTheme ? 'dark-theme' : 'light-theme'}`}>
      <div className="login-container">
        <div className="login-logo">
          <img
            src="logoHomeFB.png"
            alt="App Logo"
            className="light-logo"
          />
          <img
            src="logoHomeFN.png"
            alt="App Logo"
            className="dark-logo"
          />
        </div>

        <h1>FPGA Circuit Visualizer</h1>
        <p className="app-description">
          Explore, analyze, and interact with FPGA circuit designs
        </p>

        <div className="login-card">
          <div className="login-tabs">
            <button
              className={activeTab === "student" ? "active" : ""}
              onClick={() => setActiveTab("student")}
            >
              Student
            </button>
            <button
              className={activeTab === "teacher" ? "active" : ""}
              onClick={() => setActiveTab("teacher")}
            >
              Teacher
            </button>
          </div>

          <div className="login-form">
            {activeTab === "teacher" ? (
              <>
                <div className="form-group">
                  <label htmlFor="teacher-password">Teacher Access</label>
                  <input
                    id="teacher-password"
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyPress={(e) => handleKeyPress(e, "teacher")}
                    className="login-input"
                  />
                </div>
                <button
                  className="login-button"
                  onClick={handleTeacherLogin}
                >
                  Login as Teacher
                </button>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="student-username">Student Access</label>
                  <input
                    id="student-username"
                    type="text"
                    placeholder="Enter your name"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyPress={(e) => handleKeyPress(e, "student")}
                    className="login-input"
                  />
                </div>
                <button
                  className="login-button"
                  onClick={handleStudentLogin}
                >
                  Enter as Student
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;