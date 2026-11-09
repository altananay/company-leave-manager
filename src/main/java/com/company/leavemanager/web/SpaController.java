package com.company.leavemanager.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Serves the built SPA for the shell routes (single-origin deployment, ADR 0002).
 *
 * <p>Nested client routes are matched too ({@code /leave/requests}, backlog B-4): the SPA decides
 * which screen a path shows, so opening it directly must return the shell and not a 403. Only
 * dot-free segments match, so static assets ({@code /assets/app.js}) are never swallowed by the
 * fallback, and only the routes security allows reach here — an unknown non-API path stays denied.
 */
@Controller
public class SpaController {

    @GetMapping({
            "/",
            "/{path:[^\\.]*}",
            "/leave/{first:[^\\.]*}",
            "/leave/{first:[^\\.]*}/{second:[^\\.]*}"
    })
    public String forwardToIndex() {
        return "forward:/index.html";
    }
}
