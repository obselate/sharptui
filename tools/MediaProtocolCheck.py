#!/usr/bin/env python3
import base64
import pathlib
import re
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
DLL = ROOT / 'bin/Release/net10.0/SharpTui.dll'
EXPECTED = {(x, y) for y in range(2, 8) for x in range(2, 14)
            if not (6 <= x < 10 and 4 <= y < 6)}


def kitty(data):
    images, placements = {}, []
    chunks = bytearray()
    current = None
    for control, payload in re.findall(rb'\x1b_G([^;\x1b]*);?([^\x1b]*)\x1b\\', data):
        fields = dict(item.split(b'=', 1) for item in control.split(b','))
        assert fields.get(b'q') == b'2', 'graphics must not send unsolicited replies'
        action = fields.get(b'a')
        if action == b't':
            assert not chunks
            current = fields
        if payload:
            assert len(payload) <= 4096 and len(payload) % 4 == 0
            if not action:
                assert set(fields) <= {b'm', b'q'}, 'continuations must contain only m and q'
            chunks.extend(base64.b64decode(payload, validate=True))
            if fields[b'm'] == b'0':
                width, height = int(current[b's']), int(current[b'v'])
                channels = int(current[b'f']) // 8
                assert channels in (3, 4) and len(chunks) == width * height * channels
                assert chunks[:channels] == bytes([255, 0, 0, 255])[:channels]
                images[int(current[b'i'])] = bytes(chunks)
                chunks.clear()
        if action == b'p':
            assert int(fields[b'i']) in images and fields[b'U'] == b'1'
            placements.append(fields)
    assert not chunks and placements
    assert all(p[b'U'] == b'1' and p[b'p'] == b'1' for p in placements)
    text = re.sub(rb'\x1b_G[^\x1b]*\x1b\\', b'', data).decode('utf-8')
    covered = set()
    for move in re.finditer(r'\x1b\[(\d+);(\d+)H((?:\x1b\[[\d;]+m|[^\x1b])*)', text):
        row, column = int(move[1]) - 1, int(move[2]) - 1
        cells = re.findall('\U0010eeee[^\x1b\U0010eeee]*', move[3])
        for offset, cell in enumerate(cells):
            assert len(cell) >= 3, 'placeholders must include row and column diacritics'
            assert (column + offset, row) not in covered
            covered.add((column + offset, row))
    assert covered == EXPECTED, 'Kitty placeholder cells must clip exactly around the overlay'



def sixel(data):
    pixels = set()
    for match in re.finditer(rb'\x1bP0;1q(.*?)\x1b\\', data, re.S):
        stream, i, x, y = match[1], 0, 0, 0
        while i < len(stream):
            value = stream[i]
            i += 1
            if value in (34, 35):
                while i < len(stream) and (48 <= stream[i] <= 57 or stream[i] == 59):
                    i += 1
                continue
            if value == 36:
                x = 0
                continue
            if value == 45:
                x = 0
                y += 6
                continue
            repeat = 1
            if value == 33:
                start = i
                while i < len(stream) and 48 <= stream[i] <= 57:
                    i += 1
                repeat = int(stream[start:i])
                value = stream[i]
                i += 1
            assert 63 <= value <= 126 and repeat <= 16384
            bits = value - 63
            for offset in range(repeat):
                for bit in range(6):
                    if bits & (1 << bit):
                        pixels.add((x + offset, y + bit))
            x += repeat
    assert pixels
    covered = {(x // 8, y // 16) for x, y in pixels}
    assert covered == EXPECTED, 'Sixel image must clip exactly around the overlay'
    assert len(pixels) == len(EXPECTED) * 8 * 16, 'transparent gaps must not erase adjacent fragments'


with tempfile.TemporaryDirectory(prefix='sharptui-protocol-') as directory:
    subprocess.run(['dotnet', str(DLL), '--mediadump', directory], cwd=ROOT, check=True)
    kitty((pathlib.Path(directory) / 'Kitty.ansi').read_bytes())
    sixel((pathlib.Path(directory) / 'Sixel.ansi').read_bytes())
print('media protocol check: ok (chunking, pixels, clipping, transparent Sixel fragments)')
