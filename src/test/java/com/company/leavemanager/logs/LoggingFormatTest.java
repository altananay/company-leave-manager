package com.company.leavemanager.logs;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The logging contract (spec 0006 AC-3/D-4): every mode writes ECS JSON to the console. The optional
 * Filebeat profile ships exactly these lines to Elasticsearch; a human-readable pattern here would
 * leave Elasticsearch with unparsed text.
 */
class LoggingFormatTest {

    @Test
    void shouldConfigureTheEcsConsoleFormat() throws Exception {
        List<PropertySource<?>> sources = new YamlPropertySourceLoader()
                .load("application", new ClassPathResource("application.yml"));

        assertThat(sources).isNotEmpty();
        assertThat(sources.getFirst().getProperty("logging.structured.format.console")).isEqualTo("ecs");
    }
}
