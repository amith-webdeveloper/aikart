const sessions = new Map();

function createSession(sessionId) {
    return {
        sessionId,
        messages: [],
        lastSearchResults: [],
        selectedProductId: null,
        cart: [],
        cartVersion: 0,
        checkout: null,
        payment: null,
    };
}

function getOrCreateSession(sessionId) {
    if (!sessionId || typeof sessionId !== "string") {
        throw new Error("A valid session ID is required");
    }

    if (!sessions.has(sessionId)) {
        sessions.set(
            sessionId,
            createSession(sessionId)
        );
    }

    return sessions.get(sessionId);
}

function deleteSession(sessionId) {
    return sessions.delete(sessionId);
}

function clearSessions() {
    sessions.clear();
}

module.exports = {
    getOrCreateSession,
    deleteSession,
    clearSessions,
};