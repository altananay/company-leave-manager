package com.company.leavemanager.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import org.junit.jupiter.api.Test;

import java.util.List;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

/**
 * The forbidden dependencies of {@code docs/architecture.md}, enforced as tests: rules 1, 2, 3
 * (JPA entities stay inside their module) and 4.
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
    void controllers_never_depend_on_repositories_directly() {
        // Controllers live in <module>.api and repositories in <module>.internal, so the rule matches
        // the real packages: a controller must go through a use case, never through a repository.
        // Spring's own abstractions (e.g. SecurityContextRepository) are not storage and are excluded.
        noClasses()
                .that().haveSimpleNameEndingWith("Controller")
                .should().dependOnClassesThat(DescribedPredicate.and(
                        JavaClass.Predicates.resideInAPackage("com.company.leavemanager.."),
                        JavaClass.Predicates.simpleNameEndingWith("Repository")))
                .because("controllers go through the module's use cases, not its storage")
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

    /** Rule 3: a JPA entity is only touched by classes of its own module. */
    @Test
    void jpa_entities_never_leave_their_module() {
        classes()
                .that().areAnnotatedWith(jakarta.persistence.Entity.class)
                .should(new ArchCondition<JavaClass>("be accessed only from their own module") {
                    @Override
                    public void check(JavaClass entity, ConditionEvents events) {
                        String module = moduleOf(entity.getPackageName());
                        for (JavaAccess<?> access : entity.getAccessesToSelf()) {
                            String origin = access.getOriginOwner().getPackageName();
                            if (!origin.startsWith("com.company.leavemanager." + module)) {
                                events.add(SimpleConditionEvent.violated(entity,
                                        origin + " accesses the entity " + entity.getName()));
                            }
                        }
                    }
                })
                .allowEmptyShould(true)
                .check(CLASSES);
    }

    private static String moduleOf(String packageName) {
        String prefix = "com.company.leavemanager.";
        String rest = packageName.startsWith(prefix) ? packageName.substring(prefix.length()) : packageName;
        int dot = rest.indexOf('.');
        return dot < 0 ? rest : rest.substring(0, dot);
    }
}
