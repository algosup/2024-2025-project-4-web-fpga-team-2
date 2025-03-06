import { useEffect, useState } from "react";

interface StudentPageProps {
  username: string;
}

function StudentPage({ username }: StudentPageProps) {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:5001");
  
    socket.onopen = () => console.log("[Student] Connected to WebSocket");
  
    socket.onmessage = (event) => {
      console.log(`[Student] Message received: ${event.data}`);
      setMessages((prev) => [...prev, event.data]);
    };
  
    socket.onerror = (error) => console.error("[Student] WebSocket Error:", error);
  
    socket.onclose = () => console.log("[Student] WebSocket connection closed");
  
    return () => socket.close();
  }, []);
  

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Welcome, {username}!</h1>
      <h3>Messages from Teacher:</h3>
      <ul>
        {messages.length > 0 ? (
          messages.map((msg, index) => <li key={index}>{msg}</li>)
        ) : (
          <p>No messages yet...</p>
        )}
      </ul>
    </div>
  );
}

export default StudentPage;
