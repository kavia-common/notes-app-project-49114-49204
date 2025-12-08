import React, { useEffect, useState } from "react";
import "./App.css";
import NotesPage from "./pages/NotesPage";

// PUBLIC_INTERFACE
function App() {
  /** App root that applies theme and renders the Notes page. */
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <div className="App">
      <header className="App-header" style={{ minHeight: 0, padding: 0 }}>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? "🌙 Dark" : "☀️ Light"}
        </button>
      </header>
      <NotesPage />
    </div>
  );
}

export default App;
