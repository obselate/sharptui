#!/usr/bin/env python3
import errno
import fcntl
import os
import pathlib
import select
import signal
import sys
import termios
import time


ROOT = pathlib.Path(__file__).resolve().parents[1]
DLL = ROOT / "bin" / "Release" / "net10.0" / "tuitool.dll"

ESC = b"\x1b"
OSC11 = ESC + b"]11;"
QUERY_BEL = OSC11 + b"?\x07"
QUERY_ST = OSC11 + b"?" + ESC + b"\\"
APP_BACKGROUND = b"#0e1117"
ORIGINAL_BACKGROUND = b"rgb:1111/2222/3333"
ORIGINAL_REPLY_BEL = OSC11 + ORIGINAL_BACKGROUND + b"\x07"
ORIGINAL_REPLY_ST = OSC11 + ORIGINAL_BACKGROUND + ESC + b"\\"


def read_available(descriptor, timeout):
    ready, _, _ = select.select([descriptor], [], [], timeout)
    if not ready:
        return b""
    try:
        return os.read(descriptor, 65536)
    except OSError as error:
        if error.errno == errno.EIO:
            return b""
        raise


def collect(descriptor, duration):
    end = time.monotonic() + duration
    output = bytearray()
    while time.monotonic() < end:
        output.extend(read_available(descriptor, min(0.1, end - time.monotonic())))
    return bytes(output)


def pump(descriptor, output, duration, reply=None):
    end = time.monotonic() + duration
    answered = False
    before_reply = None
    while time.monotonic() < end:
        output.extend(read_available(descriptor, min(0.1, end - time.monotonic())))
        if reply is not None and not answered:
            current = bytes(output)
            if QUERY_BEL in current or QUERY_ST in current:
                before_reply = current
                os.write(descriptor, reply)
                answered = True
    return answered, before_reply


def osc11_values(data):
    values = []
    offset = 0
    while True:
        start = data.find(OSC11, offset)
        if start < 0:
            return values
        payload_start = start + len(OSC11)
        bel = data.find(b"\x07", payload_start)
        st = data.find(ESC + b"\\", payload_start)
        ends = [end for end in (bel, st) if end >= 0]
        if not ends:
            return values
        end = min(ends)
        values.append(data[payload_start:end])
        offset = end + (1 if end == bel else 2)


def non_query_osc11(data):
    return [value for value in osc11_values(data) if value != b"?"]


def exited(pid):
    found, status = os.waitpid(pid, os.WNOHANG)
    return found == pid, status


def wait_exit(pid, seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        done, status = exited(pid)
        if done:
            return status
        time.sleep(0.01)
    raise TimeoutError("SharpTui did not exit")


def spawn():
    master, slave = os.openpty()
    before = termios.tcgetattr(slave)
    pid = os.fork()
    if pid == 0:
        os.setsid()
        fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
        os.close(master)
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        if slave > 2:
            os.close(slave)
        environment = os.environ.copy()
        environment["TERM"] = environment.get("TERM", "xterm-256color")
        os.execvpe("dotnet", ["dotnet", str(DLL)], environment)
    return master, slave, before, pid


def assert_running_state(slave):
    live = termios.tcgetattr(slave)
    local_flags = live[3]
    raw_flags = termios.ECHO | termios.ICANON
    if local_flags & raw_flags:
        raise RuntimeError("SharpTui left ECHO or ICANON enabled while running")


def run_session(name, reply=None):
    master, slave, before, pid = spawn()
    reaped = False
    output = bytearray()
    try:
        answered, before_reply = pump(master, output, 0.65, reply)
        if not output:
            raise RuntimeError(f"{name}: SharpTui did not paint in the PTY")
        assert_running_state(slave)

        if reply is None:
            if answered:
                raise RuntimeError(f"{name}: unexpectedly answered an OSC query")
            if non_query_osc11(bytes(output)):
                raise RuntimeError(f"{name}: emitted OSC 11 set/reset without a reply")
        else:
            if not answered:
                raise RuntimeError(f"{name}: SharpTui did not emit an OSC 11 query")
            before_set = non_query_osc11(before_reply or b"")
            if before_set:
                raise RuntimeError(f"{name}: set OSC 11 before a valid query reply")
            pump(master, output, 0.45)
            values = non_query_osc11(bytes(output))
            expected_set = [APP_BACKGROUND]
            if values != expected_set:
                raise RuntimeError(
                    f"{name}: expected OSC 11 set {expected_set!r}, got {values!r}"
                )
            if ORIGINAL_BACKGROUND in bytes(output):
                raise RuntimeError(f"{name}: original OSC reply leaked before exit")

        os.write(master, b"x")
        input_output = collect(master, 0.35)
        if not input_output:
            raise RuntimeError(f"{name}: SharpTui did not repaint after PTY input")
        if not input_output.startswith(ESC):
            raise RuntimeError(f"{name}: SharpTui echoed a raw PTY input byte before the frame")

        if reply is None:
            for sequence in (b"\x1b[4~", b"\x1b[1~", b"\x1b[8~", b"\x1b[7~",
                             b"\x1b[4;5~", b"\x1b[1;5~", b"\x1b[8;5~", b"\x1b[7;5~"):
                os.write(master, sequence)
                endpoint_output = collect(master, 0.2)
                if b"git" not in endpoint_output or b"motion" not in endpoint_output:
                    raise RuntimeError(f"{name}: {sequence!r} did not move between picker endpoints")

        os.write(master, ESC)
        status = wait_exit(pid, 2.0)
        reaped = True
        output.extend(collect(master, 0.2))
        if not os.WIFEXITED(status) or os.WEXITSTATUS(status) != 0:
            raise RuntimeError(f"{name}: SharpTui exited with status {status}")

        values = osc11_values(bytes(output))
        if reply is None:
            if non_query_osc11(bytes(output)):
                raise RuntimeError(f"{name}: emitted OSC 11 set/reset after timeout")
        else:
            expected = [b"?", APP_BACKGROUND, ORIGINAL_BACKGROUND]
            if values != expected:
                raise RuntimeError(f"{name}: expected OSC 11 sequence {expected!r}, got {values!r}")
            expected_restore = OSC11 + ORIGINAL_BACKGROUND + ESC + b"\\"
            if expected_restore not in bytes(output):
                raise RuntimeError(f"{name}: exact original payload was not restored")

        after = termios.tcgetattr(slave)
        if after != before:
            raise RuntimeError(f"{name}: SharpTui did not restore the exact PTY termios state")
    finally:
        if reaped:
            done = True
        else:
            done, _ = exited(pid)
        if not done:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        os.close(master)
        os.close(slave)


def run():
    if not DLL.is_file():
        raise FileNotFoundError(f"build Release first: {DLL}")
    run_session("no-reply")
    run_session("BEL-reply", ORIGINAL_REPLY_BEL)
    run_session("ST-reply", ORIGINAL_REPLY_ST)


if __name__ == "__main__":
    try:
        run()
        print("linux PTY check: ok (no-reply, BEL, ST, Home/End tilde keys)")
    except Exception as error:
        print(f"linux PTY check FAILED: {error}", file=sys.stderr)
        sys.exit(1)
