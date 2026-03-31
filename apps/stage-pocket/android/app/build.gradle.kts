val androidMinSdk = rootProject.extra["minSdkVersion"] as Int
val androidCompileSdk = rootProject.extra["compileSdkVersion"] as Int
val androidTargetSdk = rootProject.extra["targetSdkVersion"] as Int
val androidxAppCompatVersion = rootProject.extra["androidxAppCompatVersion"] as String
val androidxCoordinatorLayoutVersion = rootProject.extra["androidxCoordinatorLayoutVersion"] as String
val coreSplashScreenVersion = rootProject.extra["coreSplashScreenVersion"] as String
val junitVersion = rootProject.extra["junitVersion"] as String
val androidxJunitVersion = rootProject.extra["androidxJunitVersion"] as String
val androidxEspressoCoreVersion = rootProject.extra["androidxEspressoCoreVersion"] as String

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
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        aaptOptions {
            // Files and dirs to omit from the packaged assets dir, modified to accommodate modern web apps.
            // Default: https://android.googlesource.com/platform/frameworks/base/+/282e181b58cf72b6ca770dc7ca5f91f135444502/tools/aapt/AaptAssets.cpp#61
            ignoreAssetsPattern = "!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~"
        }
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

    kotlinOptions {
        jvmTarget = "21"
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
    if (servicesJson.readText().isNotBlank()) {
        apply(plugin = "com.google.gms.google-services")
    }
} catch (error: Exception) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
