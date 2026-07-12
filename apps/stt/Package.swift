// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "oplyr-stt",
  platforms: [.macOS(.v14)],
  dependencies: [
    // Pinned exactly (not a range): FluidAudio downloads + loads native CoreML model weights at
    // runtime, so its version must not drift without review. Bump deliberately + re-commit Package.resolved.
    .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.15.3")
  ],
  targets: [
    .executableTarget(
      name: "oplyr-stt",
      dependencies: [.product(name: "FluidAudio", package: "FluidAudio")]
    )
  ]
)
