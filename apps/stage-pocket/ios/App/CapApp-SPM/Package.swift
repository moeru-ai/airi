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
        .package(
            url: "https://github.com/ionic-team/capacitor-swift-pm.git",
            exact: "8.0.0"
        ),
        .package(
            name: "CapacitorLocalNotifications",
            path: "../../../../../node_modules/.pnpm/@capacitor+local-notifications@8.0.0_@capacitor+core@8.0.0/node_modules/@capacitor/local-notifications"
        )
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(
                    name: "CapacitorLocalNotifications",
                    package: "CapacitorLocalNotifications"
                )
            ]
        )
    ]
)
