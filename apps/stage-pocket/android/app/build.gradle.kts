import org.jetbrains.kotlin.gradle.dsl.JvmTarget

import java.util.Properties
import java.net.URI
import java.security.MessageDigest

val minSdkVersion: Int by rootProject.extra
val compileSdkVersion: Int by rootProject.extra
val targetSdkVersion: Int by rootProject.extra
val androidxAppCompatVersion: String by rootProject.extra
val androidxCoordinatorLayoutVersion: String by rootProject.extra
val coreSplashScreenVersion: String by rootProject.extra
val junitVersion: String by rootProject.extra
val androidxJunitVersion: String by rootProject.extra
val androidxEspressoCoreVersion: String by rootProject.extra
val okhttpVersion: String by rootProject.extra
val orgJsonVersion: String by rootProject.extra

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
    implementation("com.squareup.okhttp3:okhttp:$okhttpVersion")
    implementation(project(":capacitor-android"))
    implementation(files("libs/sherpa-onnx-1.13.8.aar"))
    testImplementation("junit:junit:$junitVersion")
    testImplementation("org.json:json:$orgJsonVersion")
    androidTestImplementation("androidx.test.ext:junit:$androidxJunitVersion")
    androidTestImplementation("androidx.test.espresso:espresso-core:$androidxEspressoCoreVersion")
    implementation(project(":capacitor-cordova-android-plugins"))
}

// The installed APK includes Sherpa's native library. The pinned download keeps
// the 50 MB AAR out of Git while making the native build reproducible.
val sherpaAar = layout.projectDirectory.file("libs/sherpa-onnx-1.13.8.aar")
val downloadSherpaAar by tasks.registering {
    outputs.file(sherpaAar)
    outputs.upToDateWhen { false }
    doLast {
        val target = sherpaAar.asFile
        val expectedSha256 = "633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96"
        val source = "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar"
        target.parentFile.mkdirs()
        if (!target.exists()) {
            val temporary = target.resolveSibling("${target.name}.download")
            try {
                val connection = URI(source).toURL().openConnection().apply {
                    connectTimeout = 30000
                    readTimeout = 120000
                }
                connection.getInputStream().use { input -> temporary.outputStream().use(input::copyTo) }
                temporary.renameTo(target) || error("Cannot install Sherpa ONNX AAR")
            } finally {
                temporary.delete()
            }
        }
        val actualSha256 = target.inputStream().use { input ->
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(8192)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
            digest.digest().joinToString("") { "%02x".format(it) }
        }
        check(actualSha256 == expectedSha256) { "Sherpa ONNX AAR checksum mismatch" }
    }
}

tasks.named("preBuild") {
    dependsOn(downloadSherpaAar)
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
