import Foundation

enum FrameType: UInt8 { case audio = 0, finalize = 1, reset = 2 }
struct Frame { let type: FrameType; let payload: Data }

/// Blocking reader over stdin. Returns nil at EOF.
final class FrameReader {
  private let handle = FileHandle.standardInput

  private func readExact(_ n: Int) -> Data? {
    var buf = Data(); buf.reserveCapacity(n)
    while buf.count < n {
      let chunk = handle.readData(ofLength: n - buf.count)
      if chunk.isEmpty { return nil }  // EOF
      buf.append(chunk)
    }
    return buf
  }

  func next() -> Frame? {
    guard let header = readExact(5), let type = FrameType(rawValue: header[0]) else { return nil }
    let length = header.subdata(in: 1..<5).withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
    if length == 0 { return Frame(type: type, payload: Data()) }
    guard let payload = readExact(Int(length)) else { return nil }  // EOF mid-payload → treat as EOF
    return Frame(type: type, payload: payload)
  }
}

/// Little-endian Int16 PCM -> Float32 [-1, 1].
func pcm16ToFloat(_ data: Data) -> [Float] {
  let count = data.count / 2
  var out = [Float](repeating: 0, count: count)
  data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
    let p = raw.bindMemory(to: Int16.self)
    for i in 0..<count { out[i] = Float(Int16(littleEndian: p[i])) / 32768.0 }
  }
  return out
}
