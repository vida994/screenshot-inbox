// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ScreenshotInboxSettings",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "ScreenshotInboxSettings", targets: ["ScreenshotInboxSettings"])],
    targets: [
        .target(name: "SettingsCore"),
        .target(name: "ReceiverSupport", dependencies: ["SettingsCore"]),
        .executableTarget(name: "ScreenshotInboxSettings", dependencies: ["SettingsCore", "ReceiverSupport"]),
        .testTarget(name: "SettingsCoreTests", dependencies: ["SettingsCore"]),
        .testTarget(name: "ReceiverSupportTests", dependencies: ["ReceiverSupport"])
    ]
)
