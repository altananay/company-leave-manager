package com.company.leavemanager.identity.internal;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * The authenticated principal; also the shape the API returns for the current user.
 *
 * <p>The {@code passwordHash} is only present while the authentication manager checks a login.
 * The principal stored in the session is built with {@code null}: Spring Session serializes it into
 * {@code spring_session_attributes}, and a password hash has no business sitting there for hours.
 */
public record AppUserPrincipal(
        UUID id,
        String email,
        String displayName,
        Role role,
        String passwordHash,
        boolean mustChangePassword,
        boolean active) implements UserDetails {

    /** The same principal without the credential, safe to keep in the session. */
    public AppUserPrincipal withoutCredentials() {
        return new AppUserPrincipal(id, email, displayName, role, null, mustChangePassword, active);
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return active;
    }

    /** Never print the credential (R-10: no password, not even its hash). */
    @Override
    public String toString() {
        return "AppUserPrincipal[id=" + id + ", email=" + email + ", role=" + role + "]";
    }
}
