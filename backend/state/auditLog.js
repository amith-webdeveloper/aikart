function recordAuditEvent(session, type, details = {}) {
    if (!session || typeof session !== "object") {
        throw new Error("A valid session is required");
    }

    if (typeof type !== "string" || !type) {
        throw new Error("A valid audit event type is required");
    }

    if (!Array.isArray(session.auditLog)) {
        throw new Error("Session audit log is not initialized");
    }

    const event = {
        type,
        timestamp: new Date().toISOString(),
        ...details,
    };

    session.auditLog.push(event);

    return event;
}

module.exports = {
    recordAuditEvent,
};