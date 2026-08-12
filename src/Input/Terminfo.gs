package SharpTui

import System.Collections.Generic
import System
import System.Runtime.InteropServices

internal struct TerminfoKeySequence {
  internal var Bytes []uint8
  internal var Key Key
  internal var KeyCode int32
  internal var Modifiers KeyModifiers
}

internal enum TerminfoOutputKind { Byte; Key }

internal struct TerminfoOutput {
  internal var Kind TerminfoOutputKind
  internal var Byte uint8
  internal var Event UiEvent
}

internal class TerminfoKeyDecoder {
  private var sequences []TerminfoKeySequence
  private var pending List[uint8]
  private var outputs List[TerminfoOutput]
  private var outputHead int32

  internal prop Enabled bool { get { return sequences.Length > 0 } }
  internal prop HasPendingPrefix bool { get { return pending.Count > 0 } }

  internal init() {
    sequences = []TerminfoKeySequence{}
    pending = List[uint8](16)
    outputs = List[TerminfoOutput](8)
    outputHead = 0
  }

  internal func Configure(value []TerminfoKeySequence) {
    sequences = value
    pending.Clear()
    outputs.Clear()
    outputHead = 0
  }

  internal func Feed(value uint8) {
    pending.Add(value)
    drain(false)
  }

  internal func Flush() {
    drain(true)
  }

  internal func TryDequeue(out output TerminfoOutput) bool {
    if outputHead >= outputs.Count {
      output = TerminfoOutput{}
      return false
    }
    output = outputs[outputHead]
    outputHead = outputHead + 1
    if outputHead == outputs.Count {
      outputs.Clear()
      outputHead = 0
    }
    return true
  }

  private func drain(flush bool) {
    while pending.Count > 0 {
      var exact = -1
      var longer = false
      var prefix = false
      scan(out exact, out longer, out prefix)
      if prefix && !flush {
        if exact >= 0 && !longer {
          emitKey(exact)
          removePrefix(sequences[exact].Bytes.Length)
          continue
        }
        return
      }
      let accepted = longestExactPrefix()
      if accepted >= 0 {
        emitKey(accepted)
        removePrefix(sequences[accepted].Bytes.Length)
        continue
      }
      outputs.Add(TerminfoOutput{ Kind: TerminfoOutputKind.Byte, Byte: pending[0] })
      pending.RemoveAt(0)
    }
  }

  private func scan(out exact int32, out longer bool, out prefix bool) {
    exact = -1
    longer = false
    prefix = false
    for i in 0 ... sequences.Length {
      let item = sequences[i].Bytes
      if item.Length == 0 || pending.Count > item.Length { continue }
      if !matchesPending(item, pending.Count) { continue }
      prefix = true
      if pending.Count == item.Length {
        exact = i
      }
    }
    if exact >= 0 {
      for item in sequences {
        if item.Bytes.Length <= pending.Count { continue }
        if matchesPending(item.Bytes, pending.Count) {
          longer = true
          break
        }
      }
    }
  }

  /// True when the first count bytes of item equal the pending bytes.
  private func matchesPending(item []uint8, count int32) bool {
    var at = 0
    while at < count {
      if pending[at] != item[at] { return false }
      at = at + 1
    }
    return true
  }

  private func longestExactPrefix() int32 {
    var found = -1
    var longest = 0
    for i in 0 ... sequences.Length {
      let item = sequences[i].Bytes
      if item.Length == 0 || item.Length > pending.Count || item.Length <= longest { continue }
      if matchesPending(item, item.Length) {
        found = i
        longest = item.Length
      }
    }
    return found
  }

  private func emitKey(index int32) {
    let item = sequences[index]
    outputs.Add(TerminfoOutput{
      Kind: TerminfoOutputKind.Key,
      Event: inputKey(item.Key, item.KeyCode, item.Modifiers),
    })
  }

  private func removePrefix(count int32) {
    var removed = 0
    while removed < count {
      pending.RemoveAt(0)
      removed = removed + 1
    }
  }
}

internal class TerminfoNative {
  shared {
    @DllImport("libtinfo.so.6", SetLastError: true)
    public func setupterm(term string, fd int32, out error int32) int32;

    @DllImport("libtinfo.so.6", SetLastError: true)
    public func tigetstr(name string) IntPtr;
  }
}

internal class TerminfoCapabilities {
  shared {
    internal func TryLoad(out capabilities []TerminfoKeySequence) bool {
      let term = Environment.GetEnvironmentVariable("TERM") ?? ""
      if String.IsNullOrEmpty(term) {
        capabilities = []TerminfoKeySequence{}
        return false
      }
      return TryLoad(term, out capabilities)
    }

    internal func TryLoad(term string, out capabilities []TerminfoKeySequence) bool {
      capabilities = []TerminfoKeySequence{}
      if OperatingSystem.IsWindows() || String.IsNullOrEmpty(term) { return false }
      try {
        var error = 0
        if TerminfoNative.setupterm(term, 1, out error) != 0 || error <= 0 { return false }
        let found = List[TerminfoKeySequence]()
        add(found, "kcuu1", Key.Up)
        add(found, "kcud1", Key.Down)
        add(found, "kcuf1", Key.Right)
        add(found, "kcub1", Key.Left)
        add(found, "khome", Key.Home)
        add(found, "kend", Key.End)
        add(found, "kich1", Key.Insert)
        add(found, "kdch1", Key.Delete)
        add(found, "kpp", Key.PageUp)
        add(found, "knp", Key.PageDown)
        add(found, "kf1", Key.F1)
        add(found, "kf2", Key.F2)
        add(found, "kf3", Key.F3)
        add(found, "kf4", Key.F4)
        add(found, "kf5", Key.F5)
        add(found, "kf6", Key.F6)
        add(found, "kf7", Key.F7)
        add(found, "kf8", Key.F8)
        add(found, "kf9", Key.F9)
        add(found, "kf10", Key.F10)
        add(found, "kf11", Key.F11)
        add(found, "kf12", Key.F12)
        add(found, "kbs", Key.Backspace)
        addWithModifiers(found, "kcbt", Key.BackTab, KeyModifiers.Shift)
        add(found, "kent", Key.Enter)
        addModified(found, "kUP", Key.Up)
        addModified(found, "kDN", Key.Down)
        addModified(found, "kLFT", Key.Left)
        addModified(found, "kRIT", Key.Right)
        addModified(found, "kHOM", Key.Home)
        addModified(found, "kEND", Key.End)
        addModified(found, "kPRV", Key.PageUp)
        addModified(found, "kNXT", Key.PageDown)
        addModified(found, "kDC", Key.Delete)
        addModified(found, "kIC", Key.Insert)
        capabilities = found.ToArray()
        return capabilities.Length > 0
      } catch (e Exception) {
        return false
      }
    }

    private func addModified(found List[TerminfoKeySequence], baseName string, key Key) {
      var mode = 2
      while mode <= 8 {
        let name = mode == 2 ? baseName : baseName + mode.ToString()
        addWithModifiers(found, name, key, modifiers(mode))
        mode = mode + 1
      }
    }

    private func modifiers(mode int32) KeyModifiers {
      let bits = mode - 1
      var value = KeyModifiers.None
      if (bits & 1) != 0 { value = withFlag(value, KeyModifiers.Shift) }
      if (bits & 2) != 0 { value = withFlag(value, KeyModifiers.Alt) }
      if (bits & 4) != 0 { value = withFlag(value, KeyModifiers.Ctrl) }
      return value
    }

    private func add(found List[TerminfoKeySequence], name string, key Key) {
      addWithModifiers(found, name, key, KeyModifiers.None)
    }

    private func addWithModifiers(found List[TerminfoKeySequence], name string, key Key,
        modifiers KeyModifiers) {
      let pointer = TerminfoNative.tigetstr(name)
      if pointer == IntPtr.Zero || pointer.ToInt64() == -1 { return }
      let bytes = Marshal.PtrToStringAnsi(pointer) ?? ""
      if bytes.Length == 0 { return }
      found.Add(TerminfoKeySequence{
        Bytes: System.Text.Encoding.Latin1.GetBytes(bytes),
        Key: key,
        KeyCode: inputKeyCode(key),
        Modifiers: modifiers,
      })
    }
  }
}
