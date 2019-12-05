/*
 * This file was generated by the Gradle 'init' task.
 *
 * This is a general purpose Gradle build.
 * Learn how to create Gradle builds at https://guides.gradle.org/creating-new-gradle-builds
 */

tasks.register("hello") {
    doLast {
        println("Hello, World!")
    }
}

tasks.register("helloKotlinDefault") {
    doLast {
        println("Hello, World!")
    }
}

val customProp: String by project

tasks.register("helloProjectProperty") {
    doLast {
        println("Hello, World!" + customProp)
    }
}
