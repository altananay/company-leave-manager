package com.company.leavemanager.identity.internal;

import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Service;

/** Ends every open session of a user (deactivation, password reset). */
@Service
public class SessionInvalidator {

    private final FindByIndexNameSessionRepository<? extends Session> sessions;

    public SessionInvalidator(FindByIndexNameSessionRepository<? extends Session> sessions) {
        this.sessions = sessions;
    }

    public void endAllFor(String email) {
        sessions.findByPrincipalName(email.toLowerCase())
                .values()
                .forEach(session -> sessions.deleteById(session.getId()));
    }
}
