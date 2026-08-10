package SharpTui

import System
import System.Buffers
import System.Buffers.Text
import System.IO
import System.Text

internal class TerminalBuffer {
  private var writer ArrayBufferWriter[uint8]

  internal init(capacity int32) {
    writer = ArrayBufferWriter[uint8](capacity)
  }

  internal func Reset() {
    writer.ResetWrittenCount()
  }

  internal func Count() int32 {
    return writer.WrittenCount
  }

  internal func Text() string {
    if writer.WrittenCount == 0 { return "" }
    return Encoding.UTF8.GetString(writer.WrittenSpan)
  }

  internal func WriteTo(output Stream) {
    output.Write(writer.WrittenSpan)
  }

  internal func AppendByte(value uint8) {
    let span = writer.GetSpan(1)
    span[0] = value
    writer.Advance(1)
  }

  internal func AppendAscii(value string) {
    if value.Length == 0 { return }
    let span = writer.GetSpan(value.Length)
    var i = 0
    while i < value.Length {
      span[i] = uint8(value[i])
      i = i + 1
    }
    writer.Advance(value.Length)
  }

  internal func AppendBytes(value []uint8) {
    if value.Length == 0 { return }
    let span = writer.GetSpan(value.Length)
    var i = 0
    while i < value.Length {
      span[i] = value[i]
      i = i + 1
    }
    writer.Advance(value.Length)
  }

  internal func AppendInt(value int32) {
    let span = writer.GetSpan(11)
    var written = 0
    if !Utf8Formatter.TryFormat(value, span, out written) {
      throw InvalidOperationException("terminal integer capacity")
    }
    writer.Advance(written)
  }
}
