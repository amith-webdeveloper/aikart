const API_BASE_URL = "http://localhost:3000";

async function post(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Something went wrong while contacting AIKart."
    );
  }

  return data;
}

export function sendChatMessage(sessionId, message) {
  return post("/api/chat", {
    sessionId,
    message,
  });
}