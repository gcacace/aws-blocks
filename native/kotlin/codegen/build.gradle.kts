plugins {
    id("java-library")
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.maven.publish)
}
java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}
kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11
    }
}

dependencies {
    api(libs.kotlinpoet)
    implementation(libs.kotlinx.serialization.json)

    testImplementation(libs.kotest.runner.junit5)
    testImplementation(libs.kotest.assertions.core)
    testImplementation(libs.kotest.property)
}

tasks.withType<Test> {
    useJUnitPlatform()
    systemProperty("FIXTURES_DIR", project.file("../../codegen-fixtures").absolutePath)
}

tasks.register<Test>("regenerateFixtures") {
    description = "Regenerate golden files for cross-platform codegen fixtures"
    group = "verification"
    useJUnitPlatform()
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    filter {
        includeTestsMatching("com.aws.blocks.kotlin.CodegenFixturesTest")
    }
    systemProperty("REGENERATE_FIXTURES", "1")
}