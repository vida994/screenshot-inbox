// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ScreenshotInboxSettings",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "ScreenshotInboxSettings", targets: ["ScreenshotInboxSettings"])],
    targets: [
        .target(name: "SettingsCore"),
        .executableTarget(name: "ScreenshotInboxSettings", dependencies: ["SettingsCore"]),
        .testTarget(name: "SettingsCoreTests", dependencies: ["SettingsCore"])
    ]
)
