package com.company.leavemanager.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

import java.util.List;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

/**
 * The forbidden dependencies of {@code docs/architecture.md}, enforced as tests.
 *
 * <p>Rules 1, 2 and 4 are covered here. Rule 3 (JPA entities never leave their module) has no
 * entity to check yet — the skeleton uses JDBC — and is enforced when JPA arrives
 * ({@code specs/backlog.md} B-3).
 *
 * <p>The module packages do not exist yet, so every rule allows an empty match today and starts
 * biting the moment a module reaches into another one.
 */
class ModuleBoundariesTest {

    private static final List<String> MODULES =
            List.of("identity", "org", "leave", "balance", "reporting", "audit");

    private static final JavaClasses CLASSES = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.company.leavemanager");

    @Test
    void a_module_never_reaches_into_another_modules_internal_package() {
        for (String module : MODULES) {
            ArchRule rule = noClasses()
                    .that().resideOutsideOfPackage("com.company.leavemanager." + module + "..")
                    .should().dependOnClassesThat()
                    .resideInAPackage("com.company.leavemanager." + module + ".internal..")
                    .because(module + "'s internal package is private to that module")
                    .allowEmptyShould(true);
            rule.check(CLASSES);
        }
    }

    @Test
    void web_classes_never_depend_on_repositories_directly() {
        noClasses()
                .that().resideInAPackage("..web..")
                .should().dependOnClassesThat().resideInAnyPackage("..repository..", "..internal.repository..")
                .because("controllers go through the module's public API, not its storage")
                .allowEmptyShould(true)
                .check(CLASSES);
    }

    @Test
    void reporting_never_writes() {
        noClasses()
                .that().resideInAPackage("..reporting..")
                .should().dependOnClassesThat()
                .resideInAnyPackage("org.springframework.jdbc..", "jakarta.persistence..", "org.springframework.data..")
                .because("reporting is read-only (docs/architecture.md)")
                .allowEmptyShould(true)
                .check(CLASSES);
    }

    @Test
    void modules_are_free_of_cycles() {
        slices()
                .matching("com.company.leavemanager.(*)..")
                .should().beFreeOfCycles()
                .allowEmptyShould(true)
                .check(CLASSES);
    }
}
