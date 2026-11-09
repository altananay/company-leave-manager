package com.company.leavemanager.identity.internal;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    List<User> findAllByOrderByDisplayNameAsc();

    List<User> findByManagerIdAndActiveTrue(UUID managerId);

    /**
     * The employee row as the serialisation point of the leave writes (spec 0004, L-07): a pessimistic
     * row lock ({@code SELECT … FOR UPDATE}) so two requests for the same employee cannot both pass
     * their rule check on stale state.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user from User user where user.id = :id")
    Optional<User> lockById(@Param("id") UUID id);
}
