package com.company.leavemanager.identity.api;

import com.company.leavemanager.identity.internal.User;
import com.company.leavemanager.identity.internal.UserRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The identity module's public read API for the org tree (AC-8, BR-7).
 *
 * <p>Other modules never see the {@code User} entity or its repository (architecture rule 1): the
 * leave module reads an employee through this view, which carries the manager link and the hire
 * date the balance needs. The role is a string on purpose — a {@code Role} return type would leak a
 * class from {@code identity.internal} into another module.
 */
@Service
public class EmployeeDirectory {

    public record EmployeeView(
            UUID id,
            String email,
            String displayName,
            String role,
            UUID managerId,
            LocalDate hireDate,
            boolean active) {

        public boolean isManager() {
            return "MANAGER".equals(role);
        }

        public boolean isHr() {
            return "HR".equals(role);
        }

        public boolean isCeo() {
            return "CEO".equals(role);
        }
    }

    private final UserRepository users;

    public EmployeeDirectory(UserRepository users) {
        this.users = users;
    }

    public Optional<EmployeeView> find(UUID id) {
        return users.findById(id).map(EmployeeDirectory::view);
    }

    /**
     * Look an account up by its sign-in name. The authenticated principal is identity's own type, so
     * another module addresses the actor by the name Spring Security already carries.
     */
    public Optional<EmployeeView> findByEmail(String email) {
        return users.findByEmailIgnoreCase(email).map(EmployeeDirectory::view);
    }

    public List<EmployeeView> findAll() {
        return users.findAllByOrderByDisplayNameAsc().stream().map(EmployeeDirectory::view).toList();
    }

    /** The manager's direct reports, active accounts only: a deactivated employee needs no approval. */
    public List<EmployeeView> directReports(UUID managerId) {
        return users.findByManagerIdAndActiveTrue(managerId).stream().map(EmployeeDirectory::view).toList();
    }

    /**
     * Takes the employee's row lock for the rest of the transaction (spec 0004, L-07). The leave
     * module calls this before it reads the state a rule depends on, so writes for one employee run
     * one after the other while two different employees never wait for each other.
     */
    public void lock(UUID employeeId) {
        users.lockById(employeeId);
    }

    private static EmployeeView view(User user) {
        return new EmployeeView(
                user.getId(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole().name(),
                user.getManagerId(),
                user.getHireDate(),
                user.isActive());
    }
}
