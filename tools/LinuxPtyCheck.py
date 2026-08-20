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


def run():
    if not DLL.is_file():
        raise FileNotFoundError(f"build Release first: {DLL}")
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
    reaped = False
    try:
        startup = collect(master, 0.5)
        if not startup:
            raise RuntimeError("SharpTui did not paint in the PTY")

        live = termios.tcgetattr(slave)
        local_flags = live[3]
        raw_flags = termios.ECHO | termios.ICANON
        if local_flags & raw_flags:
            raise RuntimeError("SharpTui left ECHO or ICANON enabled while running")

        os.write(master, b"x")
        input_output = collect(master, 0.35)
        if not input_output:
            raise RuntimeError("SharpTui did not repaint after PTY input")
        if not input_output.startswith(b"\x1b"):
            raise RuntimeError("SharpTui echoed a raw PTY input byte before the frame")
        os.write(master, b"\x1b")
        status = wait_exit(pid, 2.0)
        reaped = True
        if not os.WIFEXITED(status) or os.WEXITSTATUS(status) != 0:
            raise RuntimeError(f"SharpTui exited with status {status}")
        after = termios.tcgetattr(slave)
        if after != before:
            raise RuntimeError("SharpTui did not restore the exact PTY termios state")
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


if __name__ == "__main__":
    try:
        run()
        print("linux PTY check: ok")
    except Exception as error:
        print(f"linux PTY check FAILED: {error}", file=sys.stderr)
        sys.exit(1)
