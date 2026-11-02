package si.contacts;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import org.junit.jupiter.api.Test;
import si.contacts.workspace.WorkspaceScope;

/** AR-04 / ADR-0001: Workspace-owned data is reached only through the Workspace-scoped access layer. */
class ArchitectureTest {
  static final JavaClasses PROD =
      new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS).importPackages("si.contacts");

  static final String[] UNSCOPED_STORES = {
    "si.contacts.store.UserStore", "si.contacts.store.AccessStore", "si.contacts.store.HealthStore"
  };

  @Test
  void onlyTheStorePackageTouchesTheDatabase() {
    noClasses()
        .that()
        .resideOutsideOfPackage("si.contacts.store..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage("org.springframework.jdbc..", "java.sql..", "javax.sql..")
        .check(PROD);
  }

  @Test
  void everyStoreOfWorkspaceOwnedDataRequiresAWorkspaceScope() {
    methods()
        .that()
        .areDeclaredInClassesThat()
        .resideInAPackage("si.contacts.store..")
        .and()
        .areDeclaredInClassesThat()
        .haveSimpleNameEndingWith("Store")
        .and()
        .areDeclaredInClassesThat()
        .doNotHaveFullyQualifiedName(UNSCOPED_STORES[0])
        .and()
        .areDeclaredInClassesThat()
        .doNotHaveFullyQualifiedName(UNSCOPED_STORES[1])
        .and()
        .areDeclaredInClassesThat()
        .doNotHaveFullyQualifiedName(UNSCOPED_STORES[2])
        .and()
        .haveModifier(JavaModifier.PUBLIC)
        .should(takeAWorkspaceScopeFirst())
        .check(PROD);
  }

  @Test
  void onlyWorkspaceAccessUsesTheAccessStore() {
    classes()
        .that()
        .haveFullyQualifiedName("si.contacts.store.AccessStore")
        .should()
        .onlyBeAccessed()
        .byClassesThat()
        .haveNameMatching("si\\.contacts\\.(workspace\\.WorkspaceAccess|store\\.AccessStore)(\\$.*)?")
        .check(PROD);
  }

  @Test
  void onlyWorkspaceAccessCreatesAWorkspaceScope() {
    noClasses()
        .that()
        .doNotHaveFullyQualifiedName("si.contacts.workspace.WorkspaceAccess")
        .should()
        .callConstructor(WorkspaceScope.class, java.util.UUID.class, si.contacts.user.User.class, si.contacts.workspace.Role.class)
        .check(PROD);
  }

  static ArchCondition<JavaMethod> takeAWorkspaceScopeFirst() {
    return new ArchCondition<>("take a WorkspaceScope as first parameter") {
      @Override
      public void check(JavaMethod m, ConditionEvents events) {
        boolean ok =
            !m.getRawParameterTypes().isEmpty()
                && m.getRawParameterTypes().get(0).isEquivalentTo(WorkspaceScope.class);
        if (!ok) events.add(SimpleConditionEvent.violated(m, m.getFullName() + " does not take a WorkspaceScope first"));
      }
    };
  }
}
