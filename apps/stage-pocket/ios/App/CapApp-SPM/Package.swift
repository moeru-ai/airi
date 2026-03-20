// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.1.0"),
        .package(name: "CapacitorLocalNotifications", path: "../../../../../../../../Library/pnpm/store/v10/links/@capacitor/local-notifications/8.0.1/48e4ccbf4066b5327c1dd47d8575df7d5846912c64191c6674cd39c59d257dac/node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorNativeSettings", path: "../../../../../../../../Library/pnpm/store/v10/links/@/capacitor-native-settings/8.0.0/fa925ff73296270c1d620f8c2905b1d3217428d2a6f64525c6ec3b57f8167737/node_modules/capacitor-native-settings")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorNativeSettings", package: "CapacitorNativeSettings")
            ]
        )
    ]
)
