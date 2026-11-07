package com.company.leavemanager.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Serves the built SPA for the shell routes (single-origin deployment, ADR 0002).
 *
 * <p>Only single-segment paths without a dot are matched, so {@code /api/health} (two segments) and
 * static assets ({@code /assets/app.js}) are never swallowed by the fallback.
 */
@Controller
public class SpaController {

    @GetMapping({"/", "/{path:[^\\.]*}"})
    public String forwardToIndex() {
        return "forward:/index.html";
    }
}
