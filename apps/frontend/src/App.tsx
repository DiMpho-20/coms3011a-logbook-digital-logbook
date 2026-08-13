import { useEffect, useState } from "react";

type HealthResponse = {
  status: string;
};

function App() {
  const [backendStatus, setBackendStatus] = useState("Checking...");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Backend returned an error");
        }

        return response.json() as Promise<HealthResponse>;
      })
      .then((data) => {
        setBackendStatus(data.status);
      })
      .catch(() => {
        setError("Could not connect to the backend");
      });
  }, []);

  return (
    <main>
      <h1>Digital Logbook</h1>

      <p>
        Backend status:{" "}
        {error ? error : backendStatus}
      </p>
    </main>
  );
}

export default App;
