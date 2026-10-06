# macOS-style Menu Bar (GNOME 50, Wayland only)

GNOME 50 dropped the X11 session, so this extension only targets Wayland —
it uses Clutter's virtual keyboard device to send shortcuts, which isn't
reliable under Xorg. `enable()` checks `Meta.is_wayland_compositor()` and
refuses to activate (just logs a warning) if it's somehow run under X11.

Adds a Tahoe-style top bar next to Activities:

**[icon] AppName   File   Edit   View   Window   Help**

- **AppName** — shows the focused app's icon and bold name. Dropdown: About / Hide / Quit.
- **File / Edit / View** — send the real GTK/GNOME keyboard shortcuts to the
  focused app (New Window `Ctrl+N`, Undo `Ctrl+Z`, Copy `Ctrl+C`, Paste
  `Ctrl+V`, Fullscreen `F11`, Zoom `Ctrl +/-`, etc). Linux apps don't expose a
  remote-controllable menu the way macOS apps do, so this is the reliable
  equivalent — it works with whatever the focused app's own shortcuts are.
- **Window** — lists the focused app's actual open windows (click to switch),
  plus Minimize / Zoom (maximize) / Close.
- **Help** — sends `F1`, the common "open app help" shortcut.

## Install

```bash
# 1. Copy the folder into your extensions directory
cp -r macos-menubar@local ~/.local/share/gnome-shell/extensions/

# 2. Reload GNOME Shell (Wayland has no Alt+F2 "r" restart — log out, then back in)

# 3. Enable it
gnome-extensions enable macos-menubar@local
```

Or zip it and install via the **Extension Manager** app / extensions.gnome.org
"Install from file" if your distro supports local uploads.

## Notes / customizing

- Order or remove menus by editing the `enable()` method in `extension.js`
  (each is added via `add('role', new MenuBarButton(...), position)`).
- Shortcuts are standard GTK/GNOME bindings, not literal macOS ⌘-key combos —
  edit the `sendKeyCombo(...)` calls to match a specific app if it uses
  different bindings.
- Tweak colors/spacing/fonts in `stylesheet.css`.
- No settings schema is included (kept minimal); ping me if you want a
  Preferences page (e.g. to toggle which menus show, or reorder them).
