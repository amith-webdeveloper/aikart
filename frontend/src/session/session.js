const SESSION_STORAGE_KEY = "aikart_session_id";

function createSessionId() {
  return crypto.randomUUID();
}

export function getSessionId() {
  const existingSessionId =
    localStorage.getItem(SESSION_STORAGE_KEY);

  if (existingSessionId) {
    return existingSessionId;
  }

  const newSessionId = createSessionId();

  localStorage.setItem(
    SESSION_STORAGE_KEY,
    newSessionId
  );

  return newSessionId;
}