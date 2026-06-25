// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "oplyr-stt",
  platforms: [.macOS(.v14)],
  dependencies: [
    .package(url: "https://github.com/FluidInference/FluidAudio.git", from: "0.12.4")
  ],
  targets: [
    .executableTarget(
      name: "oplyr-stt",
      dependencies: [.product(name: "FluidAudio", package: "FluidAudio")]
    )
  ]
)
