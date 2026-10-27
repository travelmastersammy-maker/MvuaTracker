import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val apiBaseUrl = providers.gradleProperty("MVUA_API_BASE_URL").orNull.orEmpty()
val privacyPolicyUrl = providers.gradleProperty("MVUA_PRIVACY_POLICY_URL").orNull.orEmpty()
val signingPropertiesFile = rootProject.file("keystore.properties")
val signingProperties = Properties().apply {
    if (signingPropertiesFile.exists()) signingPropertiesFile.inputStream().use { load(it) }
}
fun buildConfigString(value: String) = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.fromTarget("17")
    }
}

android {
    namespace = "ke.mvua.tracker"
    compileSdk = 36

    defaultConfig {
        applicationId = "ke.mvua.tracker"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    buildFeatures { compose = true; buildConfig = true }

    if (signingPropertiesFile.exists()) {
        signingConfigs {
            create("release") {
                val storePath = signingProperties.getProperty("storeFile")
                    ?: throw GradleException("storeFile is missing from android/keystore.properties")
                storeFile = file(storePath)
                storePassword = signingProperties.getProperty("storePassword")
                keyAlias = signingProperties.getProperty("keyAlias")
                keyPassword = signingProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            buildConfigField("String", "MVUA_API_BASE_URL", buildConfigString("http://10.0.2.2:4174"))
            buildConfigField("String", "MVUA_PRIVACY_POLICY_URL", buildConfigString(""))
        }
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "MVUA_API_BASE_URL", buildConfigString(apiBaseUrl))
            buildConfigField("String", "MVUA_PRIVACY_POLICY_URL", buildConfigString(privacyPolicyUrl))
            if (signingPropertiesFile.exists()) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

val verifyPlayReleaseConfig = tasks.register("verifyPlayReleaseConfig") {
    doLast {
        if (!apiBaseUrl.startsWith("https://")) throw GradleException("Set MVUA_API_BASE_URL to the deployed HTTPS API before building a Play release.")
        if (!privacyPolicyUrl.startsWith("https://")) throw GradleException("Set MVUA_PRIVACY_POLICY_URL to the public HTTPS privacy policy before building a Play release.")
        if (!signingPropertiesFile.exists()) throw GradleException("Create android/keystore.properties for your private Play upload key before building a Play release.")
    }
}
tasks.matching { it.name == "bundleRelease" || it.name == "assembleRelease" }.configureEach { dependsOn(verifyPlayReleaseConfig) }

dependencies {
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    debugImplementation("androidx.compose.ui:ui-tooling")
}