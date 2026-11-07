package com.company.leavemanager.identity;

import com.company.leavemanager.identity.internal.PasswordPolicy;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PasswordPolicyTest {

    @Test
    void shouldRejectPasswordsShorterThanTwelveCharacters() {
        assertThatThrownBy(() -> PasswordPolicy.validate("short-pass1"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void shouldRejectANullPassword() {
        assertThatThrownBy(() -> PasswordPolicy.validate(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void shouldAcceptTwelveCharacters() {
        assertThatCode(() -> PasswordPolicy.validate("twelve-chars"))
                .doesNotThrowAnyException();
    }
}
