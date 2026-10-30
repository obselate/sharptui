package SharpTui

import System
import System.Collections.Generic

private func chartSample(x float64, y float64) ChartPoint -> ChartPoint{X: x, Y: y}

private func chartPixels(screen Screen, column int32) bool {
    for row in 0 ... screen.Size.HeightRows {
        if screen.Probe(column, row) != " " {
            return true
        }
    }
    return false
}

private func runChartChecks() int32 {
    var failed = 0
    let samples = ChartSeries{
        ChartStyle: ChartStyle.Points,
        Points: {chartSample(0.0, 0.0), chartSample(1.0, 0.5), chartSample(10.0, 1.0),}
    }
    let chart = ChartView{
        HorizontalRange: NumericRange.Fixed(0.0, 10.0),
        VerticalRange: NumericRange.Fixed(0.0, 1.0),
        Series: {samples}
    }
    let screen = Screen(11, 3)
    chart.Draw(screen)
    failed = failed + Checks.Expect(
        chartPixels(screen, 0) && chartPixels(screen, 1)
        && chartPixels(screen, 10) && !chartPixels(screen, 5),
        "chart points map numeric X spacing rather than sample order"
    )

    samples.ChartStyle = ChartStyle.Line
    samples.Points = List[ChartPoint]{
        chartSample(0.0, 0.5),
        chartSample(2.0, 0.5),
        chartSample(Double.NaN, 0.5),
        chartSample(8.0, 0.5),
        chartSample(10.0, 0.5)
    }
    chart.Refresh()
    chart.Draw(screen)
    failed = failed + Checks.Expect(
        chartPixels(screen, 1) && chartPixels(screen, 9)
        && !chartPixels(screen, 5),
        "chart missing samples break line segments without fake zeros"
    )
    samples.ChartStyle = ChartStyle.Area
    chart.Refresh()
    chart.Draw(screen)
    failed = failed + Checks.Expect(
        screen.Probe(1, 2) != " " && screen.Probe(5, 2) == " ",
        "chart areas fill to the lower bound without filling gaps"
    )
    samples.Points = List[ChartPoint]{chartSample(0.0, 2.0), chartSample(10.0, 2.0)}
    chart.Refresh()
    chart.Draw(screen)
    failed = failed + Checks.Expect(
        screen.Probe(5, 0) != " " && screen.Probe(5, 2) != " ",
        "chart areas above the vertical range fill the visible region"
    )

    samples.Points = List[ChartPoint]{chartSample(-10.0, 0.5), chartSample(20.0, 0.5)}
    samples.ChartStyle = ChartStyle.Line
    chart.Refresh()
    chart.Draw(screen)
    failed = failed + Checks.Expect(
        chartPixels(screen, 0) && chartPixels(screen, 10),
        "chart clips crossing segments to explicit ranges"
    )
    chart.Series.Clear()
    chart.Refresh()
    chart.Draw(screen)
    failed = failed + Checks.Expect(
        !chartPixels(screen, 0) && !chartPixels(screen, 10),
        "chart refresh clears removed samples"
    )
    chart.Series.Add(samples)
    samples.Points = List[ChartPoint]{chartSample(4.0, 7.0), chartSample(4.0, 7.0)}
    chart.HorizontalRange = NumericRange.Auto
    chart.VerticalRange = NumericRange.Auto
    chart.Draw(screen)
    failed = failed + Checks.Expect(
        chartPixels(screen, 5) && !chartPixels(screen, 0),
        "chart constant automatic ranges place samples at the center"
    )

    chart.HorizontalRange = NumericRange.Fixed(0.0, 10.0)
    chart.VerticalRange = NumericRange.Fixed(0.0, 1.0)
    samples.Points = List[ChartPoint]{
        chartSample(0.0, 0.0),
        chartSample(Double.PositiveInfinity, 0.0),
        chartSample(10.0, 1.0)
    }
    chart.HorizontalTicks.Add(ChartTick{Value: 0.0, Text: "start"})
    chart.VerticalTicks.Add(ChartTick{Value: 1.0, Text: "top"})
    chart.Refresh()
    let oneRow = Screen(11, 1)
    chart.Draw(oneRow)
    failed = failed + Checks.Expect(
        oneRow.Probe(0, 0) == "▁" && oneRow.Probe(10, 0) == "█"
        && oneRow.Probe(5, 0) == " ",
        "one-row charts use vertical block levels and omit axes"
    )
    samples.Points.RemoveAt(1)
    chart.Refresh()
    chart.Draw(oneRow)
    failed = failed + Checks.Expect(
        oneRow.Probe(5, 0) != " ",
        "one-row line charts interpolate between numeric sample positions"
    )
    let twoRows = Screen(11, 2)
    chart.Draw(twoRows)
    failed = failed + Checks.Expect(
        twoRows.Probe(0, 0) == "t" && chartPixels(twoRows, 10),
        "two-row charts retain plot rows when horizontal labels cannot fit"
    )

    chart.HorizontalTicks = List[ChartTick]{
        ChartTick{Value: 0.0, Text: "中文"},
        ChartTick{Value: 0.1, Text: "hidden"},
        ChartTick{Value: 10.0, Text: "end"}
    }
    chart.VerticalTicks.Clear()
    chart.Refresh()
    chart.Draw(screen)
    failed = failed + Checks.Expect(
        screen.Probe(0, 2) == "中" && screen.Probe(2, 2) == "文"
        && screen.Probe(4, 2) == " " && screen.Probe(8, 2) == "e",
        "chart labels use terminal widths and suppress colliding labels whole"
    )
    let narrow = Screen(3, 3)
    chart.Draw(narrow)
    failed = failed + Checks.Expect(
        narrow.Probe(0, 2) == "e" && narrow.Probe(2, 2) == "d",
        "chart suppresses labels wider than the region without splitting wide glyphs"
    )
    chart.Width = CellLength.Cells(0)
    let zeroWidth = Screen(11, 3)
    chart.Draw(zeroWidth)
    failed = failed + Checks.Expect(!chartPixels(zeroWidth, 0), "zero-width charts do not draw")
    chart.Width = CellLength.Auto

    samples.Style = Style{Foreground: Color.Rgb(90, 160, 240)}
    chart.Refresh()
    var allocated = 0L
    var visible = true
    let widths = List[int32]{40, 60, 80, 120, 160}
    let heights = List[int32]{1, 2, 12, 18, 24, 36, 48}
    for columns in widths {
        for rows in heights {
            let sized = Screen(columns, rows)
            sized.ColorMode = TerminalColorMode.NoColor
            chart.Draw(sized)
            let before = GC.GetAllocatedBytesForCurrentThread()
            for frame in 0 ... 4 {
                chart.Draw(sized)
            }
            let bytes = GC.GetAllocatedBytesForCurrentThread() - before
            allocated = allocated + bytes
            visible = visible && chartPixels(sized, columns - 1)
            let wire = sized.Flush()
            visible = visible && !wire.Contains("38;2;") && !wire.Contains("48;2;")
        }
    }
    failed = failed + Checks.Expect(
        visible,
        "chart fits endpoint and intermediate sizes and remains visible in NoColor"
    )
    failed = failed + Checks.Expect(
        allocated == 0L,
        "chart frames after the first allocate zero bytes, measured " + allocated.ToString()
    )
    return failed
}
