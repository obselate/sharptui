package SharpTui

import System
import System.Collections.Generic

internal class ApiCheck {
    shared {
        internal func Run() int32 {
            var failed = 0
            let list = ListView{
                Width: 12,
                Height: 3,
                Items: {ListItem{Id: "a", Text: "a"}, ListItem{Id: "b", Text: "b"},}
            }
            let scene = Box(){list}
            let screen = Screen(12, 3)
            scene.Draw(screen)
            scene.Focus(list)
            var calls = 0
            list.OnChange = change -> {
                calls++
                failed += Checks.Expect(
                    list.SelectedId == "b" && change.PreviousIndex == 0
                    && change.SelectedIndex == 1,
                    "selection callback observes settled identity"
                )
                list.Items = List[ListItem]{ListItem{Id: "replacement", Text: "new"}}
            }
            scene.Handle(keyEv(Key.Down))
            scene.Draw(screen)
            failed += Checks.Expect(
                calls == 1 && list.SelectedId == "replacement"
                && screen.Probe(2, 0) == "n",
                "selection callback can replace rows before the next paint"
            )
            list.SelectedIndex = 0
            scene.Draw(screen)
            failed += Checks.Expect(calls == 1, "programmatic selection and painting do not invoke callbacks")

            let entry = TextInput{Width: 12, Height: 1}
            let editorScene = Box(){entry}
            editorScene.Draw(screen)
            editorScene.Focus(entry)
            var edits = 0
            entry.OnChange = text -> {
                edits++
                failed += Checks.Expect(entry.Text == text, "text callback sees the current text")
            }
            editorScene.Handle(charEv("x"))
            editorScene.Handle(keyEv(Key.Left))
            entry.Text = "loaded"
            editorScene.Handle(UiEvent{Kind: UiEventKind.Paste, Text: ""})
            failed += Checks.Expect(
                edits == 1 && entry.Text == "loaded",
                "entry change excludes caret moves, loads and empty pastes"
            )

            let virtualSource = CallbackVirtualSource()
            let virtualList = VirtualListView{Source: virtualSource, Width: 12, Height: 3}
            let virtualScene = Box(){virtualList}
            virtualScene.Draw(screen)
            virtualScene.Focus(virtualList)
            var virtualChanges = 0
            virtualList.OnChange = change -> {
                virtualChanges++
            }
            virtualScene.Handle(keyEv(Key.Down))
            failed += Checks.Expect(virtualChanges == 1, "virtual list dispatches one selection callback")

            let toggle = Toggle{Text: "media", Width: 12, Height: 1}
            let toggleScene = Box(){toggle}
            toggleScene.Draw(screen)
            toggleScene.Focus(toggle)
            var toggleChanges = 0
            toggle.OnChange = value -> {
                toggleChanges++
            }
            toggleScene.Handle(keyEv(Key.Enter))
            toggle.IsChecked = false
            failed += Checks.Expect(toggleChanges == 1, "toggle reports activation without reporting a load")

            screen.Clear()
            let clipped = Label{Text: "clipped", Style: Style{Background: Color.Rgb("111111")}}
            clipped.Draw(
                screen,
                CellRect{Column: 2, Row: 1, WidthCells: 7, HeightRows: 2},
                CellRect{Column: 4, Row: 1, WidthCells: 2, HeightRows: 1}
            )
            screen.WriteCell(0, 0, "X")
            failed += Checks.Expect(
                screen.Probe(2, 1) == " " && screen.Probe(4, 1) == "i"
                && screen.Probe(5, 1) == "p" && screen.Probe(6, 1) == " " && screen.Probe(0, 0) == "X",
                "virtual subtree clipping preserves outside cells and restores the screen clip"
            )

            var ticks = 0
            let scoped = Overlay{IsVisible: true, Children: {Button{Text: "inside"}}}
            let timed = TestDriver(Box(){scoped}, 12, 3)
            timed.App.TickInterval = TimeSpan.FromMilliseconds(20.0)
            timed.App.OnTick = () -> {
                ticks++
            }
            timed.Send(UiEvent{Kind: UiEventKind.Tick})
            failed += Checks.Expect(ticks > 0, "app updates continue while an overlay owns input focus")

            let missingRoot = App()
            var rejected = false
            try {
                missingRoot.Run()
            } catch (error InvalidOperationException) {
                rejected = true
            }
            failed += Checks.Expect(rejected, "App requires a retained root before entering a terminal")
            return failed
        }
    }
}

internal class CallbackVirtualSource : VirtualListSource {
    public func Count() int32 -> 2

    public func KeyAt(index int32) string -> index == 0 ? "first": "second"

    public func IndexOfKey(key string) int32 -> key == "first" ? 0: 1

    public func IsSelectable(index int32) bool -> true

    public func HeightAt(index int32, width int32) int32 -> 1

    public func Render(
        index int32,
        screen Screen,
        bounds CellRect,
        clipBounds CellRect,
        style Style,
        state VirtualListItemState
    ) {
        screen.WriteClipped(clipBounds, 0, 0, KeyAt(index), style)
    }
}
