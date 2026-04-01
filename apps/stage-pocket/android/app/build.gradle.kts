import org.jetbrains.kotlin.gradle.dsl.JvmTarget

import java.util.Properties

val minSdkVersion: Int by rootProject.extra
val compileSdkVersion: Int by rootProject.extra
val targetSdkVersion: Int by rootProject.extra
val androidxAppCompatVersion: String by rootProject.extra
val androidxCoordinatorLayoutVersion: String by rootProject.extra
val coreSplashScreenVersion: String by rootProject.extra
val junitVersion: String by rootProject.extra
val androidxJunitVersion: String by rootProject.extra
val androidxEspressoCoreVersion: String by rootProject.extra

val androidMinSdk = minSdkVersion
val androidCompileSdk = compileSdkVersion
val androidTargetSdk = targetSdkVersion
val appVersionProperties = Properties().apply {
    rootProject.file("app-version.properties").inputStream().use(::load)
}
val androidVersionName = appVersionProperties.getProperty("AIRI_VERSION_NAME")
    ?: error("AIRI_VERSION_NAME is missing in android/app-version.properties")
val androidVersionCode = appVersionProperties.getProperty("AIRI_VERSION_CODE")
    ?.toIntOrNull()
    ?: error("AIRI_VERSION_CODE is missing or invalid in android/app-version.properties")

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ai.moeru.airi_pocket"
    compileSdk = androidCompileSdk

    defaultConfig {
        applicationId = "ai.moeru.airi_pocket"
        minSdk = androidMinSdk
        targetSdk = androidTargetSdk
        versionCode = androidVersionCode
        versionName = androidVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android.txt"),
                "proguard-rules.pro",
            )
        }
    }
    androidResources {
        // Files and dirs to omit from the packaged assets dir, modified to accommodate modern web apps.
        // Default: https://android.googlesource.com/platform/frameworks/base/+/282e181b58cf72b6ca770dc7ca5f91f135444502/tools/aapt/AaptAssets.cpp#61
        ignoreAssetsPattern = "!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_21)
    }
}

repositories {
    flatDir {
        dirs("../capacitor-cordova-android-plugins/src/main/libs", "libs")
    }
}

dependencies {
    implementation(fileTree(mapOf("include" to listOf("*.jar"), "dir" to "libs")))
    implementation("androidx.appcompat:appcompat:$androidxAppCompatVersion")
    implementation("androidx.coordinatorlayout:coordinatorlayout:$androidxCoordinatorLayoutVersion")
    implementation("androidx.core:core-splashscreen:$coreSplashScreenVersion")
    implementation(project(":capacitor-android"))
    testImplementation("junit:junit:$junitVersion")
    androidTestImplementation("androidx.test.ext:junit:$androidxJunitVersion")
    androidTestImplementation("androidx.test.espresso:espresso-core:$androidxEspressoCoreVersion")
    implementation(project(":capacitor-cordova-android-plugins"))
}

apply(from = "capacitor.build.gradle")

try {
    val servicesJson = file("google-services.json")
    if (servicesJson.isFile && servicesJson.length() > 0) {
        apply(plugin = "com.google.gms.google-services")
    }
} catch (error: Exception) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
