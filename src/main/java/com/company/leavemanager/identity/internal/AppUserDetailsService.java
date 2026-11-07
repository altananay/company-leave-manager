package com.company.leavemanager.identity.internal;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AppUserDetailsService implements UserDetailsService {

    private final UserRepository users;

    public AppUserDetailsService(UserRepository users) {
        this.users = users;
    }

    @Override
    public UserDetails loadUserByUsername(String username) {
        User user = users.findByEmailIgnoreCase(username)
                .orElseThrow(() -> new UsernameNotFoundException("no user: " + username));
        return new AppUserPrincipal(
                user.getId(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole(),
                user.getPasswordHash(),
                user.isMustChangePassword(),
                user.isActive());
    }
}
