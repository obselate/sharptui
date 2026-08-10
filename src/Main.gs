package SharpTui

func Main(args []string) int32 {
  var i = 0
  while i < args.Length {
    let arg = args[i]
    i = i + 1
    if arg == "--selfcheck" { return Selfcheck.Run() }
    if arg == "--bench" { return Selfcheck.Bench() }
    if arg == "--allocbench" { return AllocBench.Run() }
    if arg == "--uibench" { return AllocBench.RunUi() }
  }
  return Selfcheck.Run()
}
