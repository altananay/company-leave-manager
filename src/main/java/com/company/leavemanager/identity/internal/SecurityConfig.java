package com.company.leavemanager.identity.internal;

import com.company.leavemanager.web.Problems;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;

import java.time.Clock;

@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(IdentityProperties.class)
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    /**
     * A minimal authentication manager: load the user, compare the BCrypt hash, return the principal.
     * Lockout and the active flag are checked by the login use case before this runs.
     */
    @Bean
    AuthenticationManager authenticationManager(AppUserDetailsService details, PasswordEncoder encoder) {
        return authentication -> {
            UserDetails user = details.loadUserByUsername((String) authentication.getPrincipal());
            if (!encoder.matches((String) authentication.getCredentials(), user.getPassword())) {
                throw new BadCredentialsException("bad credentials");
            }
            return new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
        };
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
                                            SecurityContextRepository contextRepository,
                                            IdentityProperties identityProperties,
                                            Clock clock,
                                            Problems problems) throws Exception {
        MustChangePasswordFilter mustChangePassword = new MustChangePasswordFilter(problems);
        SessionAgeFilter sessionAge = new SessionAgeFilter(identityProperties, clock, problems);

        http
                .csrf(csrf -> csrf
                        .csrfTokenRepository(new HttpSessionCsrfTokenRepository())
                        // Plain handler: the SPA sends the raw token from GET /api/auth/csrf.
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
                .securityContext(context -> context
                        .securityContextRepository(contextRepository)
                        .requireExplicitSave(true))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .authorizeHttpRequests(auth -> auth
                        // Public: the health probe, the login form and the CSRF bootstrap.
                        .requestMatchers("/api/health", "/api/auth/login", "/api/auth/csrf").permitAll()
                        // Every other API endpoint is listed explicitly; an unlisted one is denied.
                        .requestMatchers("/api/auth/me", "/api/auth/logout", "/api/auth/password").authenticated()
                        .requestMatchers("/api/users/**").hasRole("HR")
                        // Leave: reads for every signed-in role; the balance correction is HR's, and
                        // the manager queue is the direct manager's (BR-7). The rest of the rules are
                        // the service's job — a path rule is the coarse gate, never the authorization.
                        .requestMatchers(HttpMethod.POST, "/api/leave/adjustments").hasRole("HR")
                        .requestMatchers(HttpMethod.GET, "/api/leave/queue").hasRole("MANAGER")
                        .requestMatchers("/api/leave/**").authenticated()
                        // The SPA shell is served for its client routes too, so a nested route can be
                        // opened directly (spec 0004 AC-9, backlog B-4). The HTML is public; every
                        // endpoint behind it still requires a session. Nothing else is forwarded:
                        // an unknown non-API path stays denied (spec 0002).
                        .requestMatchers(HttpMethod.GET, "/leave", "/leave/**").permitAll()
                        // The SPA shell and its assets stay public; anything else is denied by default.
                        .requestMatchers("/", "/index.html", "/favicon.svg", "/icons.svg", "/assets/**", "/error")
                        .permitAll()
                        .anyRequest().denyAll())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, failure) ->
                                problems.write(response, 401, "NOT_AUTHENTICATED"))
                        .accessDeniedHandler((request, response, failure) -> {
                            // A state-changing request without a session fails the CSRF check first;
                            // that is a lost session (401), not an authorization refusal (403).
                            Authentication authentication =
                                    SecurityContextHolder.getContext().getAuthentication();
                            boolean anonymous = authentication == null
                                    || authentication instanceof AnonymousAuthenticationToken;
                            if (anonymous) {
                                problems.write(response, 401, "NOT_AUTHENTICATED");
                                return;
                            }
                            // With a live session the refusal is a CSRF failure or a role refusal;
                            // the client needs to tell them apart.
                            problems.write(response, 403,
                                    failure instanceof CsrfException ? "CSRF_INVALID" : "NOT_AUTHORIZED");
                        }))
                // Order matters: the absolute session age is judged before the must-change gate.
                .addFilterAfter(sessionAge, SecurityContextHolderFilter.class)
                .addFilterAfter(mustChangePassword, SessionAgeFilter.class)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable);

        return http.build();
    }
}
