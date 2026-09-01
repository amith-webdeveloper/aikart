const test = require("node:test");
const assert = require("node:assert/strict");

const {
    getOrCreateSession,
    deleteSession,
    clearSessions,
} = require("../backend/state/sessionStore");

test("creates and retrieves the same session", () => {
    clearSessions();

    const first = getOrCreateSession("session-a");
    const second = getOrCreateSession("session-a");

    assert.strictEqual(first, second);
    assert.equal(first.sessionId, "session-a");
});

test("keeps different sessions isolated", () => {
    clearSessions();

    const sessionA = getOrCreateSession("session-a");
    const sessionB = getOrCreateSession("session-b");

    sessionA.selectedProductId = "lap001";

    assert.equal(
        sessionA.selectedProductId,
        "lap001"
    );

    assert.equal(
        sessionB.selectedProductId,
        null
    );
});

test("deletes a session", () => {
    clearSessions();

    getOrCreateSession("session-a");

    assert.equal(
        deleteSession("session-a"),
        true
    );

    const newSession =
        getOrCreateSession("session-a");

    assert.equal(
        newSession.selectedProductId,
        null
    );
});