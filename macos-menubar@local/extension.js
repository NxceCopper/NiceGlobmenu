/* macOS-style Menu Bar
 *
 * Adds, next to the Activities button:
 *   [icon] AppName   File   Edit   View   Window   Help
 *
 * - The app item shows the focused app's icon + bold name, and its dropdown
 *   has About / Hide / Quit for that app.
 * - File / Edit / View send the *real* keyboard shortcuts for those actions
 *   (Ctrl+N, Ctrl+Z, Ctrl+C, F11, etc.) to whichever window is focused, since
 *   there is no cross-app way to remote-control an arbitrary Linux app's
 *   menu the way macOS's Cmd-key menu bar can.
 * - Window lists the focused app's actual open windows and lets you switch,
 *   minimize, zoom (maximize) or close them.
 * - Help sends F1 (the common "app help" shortcut).
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// ---------------------------------------------------------------------------
// Virtual keyboard helper — lets menu items trigger real app shortcuts.
// ---------------------------------------------------------------------------
let _virtualKeyboard = null;
function _getVirtualKeyboard() {
    if (!_virtualKeyboard) {
        const seat = Clutter.get_default_backend().get_default_seat();
        _virtualKeyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }
    return _virtualKeyboard;
}

/** Press every keyval in order, then release in reverse order. */
function sendKeyCombo(...keyvals) {
    const kb = _getVirtualKeyboard();
    const time = Clutter.get_current_event_time();
    for (const kv of keyvals)
        kb.notify_keyval(time, kv, Clutter.KeyState.PRESSED);
    for (const kv of [...keyvals].reverse())
        kb.notify_keyval(time, kv, Clutter.KeyState.RELEASED);
}

// ---------------------------------------------------------------------------
// Generic "menu bar item": a plain label in the panel with a dropdown list
// of static actions. Pass 'separator' in the items array for a divider.
// ---------------------------------------------------------------------------
const MenuBarButton = GObject.registerClass(
class MenuBarButton extends PanelMenu.Button {
    _init(title, items) {
        super._init(0.0, `macOSMenuBar_${title}`, false);

        this._label = new St.Label({
            text: title,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'menubar-label',
        });
        this.add_child(this._label);

        for (const it of items) {
            if (it === 'separator') {
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                continue;
            }
            const menuItem = new PopupMenu.PopupMenuItem(it.label);
            if (it.action)
                menuItem.connect('activate', it.action);
            else
                menuItem.setSensitive(false);
            this.menu.addMenuItem(menuItem);
        }
    }
});

// ---------------------------------------------------------------------------
// App item: focused app's icon + bold name, with About / Hide / Quit.
// ---------------------------------------------------------------------------
const AppMenuButton = GObject.registerClass(
class AppMenuButton extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'macOSMenuBar_App', false);

        const box = new St.BoxLayout({
            style_class: 'app-menu-box',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._icon = new St.Icon({ style_class: 'app-menu-icon', icon_size: 16 });
        this._label = new St.Label({
            text: 'Desktop',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'app-menu-label',
        });
        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);

        this._aboutItem = new PopupMenu.PopupMenuItem('About This App');
        this._aboutItem.connect('activate', () => this._activateFocused());
        this.menu.addMenuItem(this._aboutItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const hideItem = new PopupMenu.PopupMenuItem('Hide');
        hideItem.connect('activate', () => {
            const win = global.display.focus_window;
            if (win)
                win.minimize();
        });
        this.menu.addMenuItem(hideItem);

        const quitItem = new PopupMenu.PopupMenuItem('Quit');
        quitItem.connect('activate', () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_q));
        this.menu.addMenuItem(quitItem);

        this._tracker = Shell.WindowTracker.get_default();
        this._trackerId = this._tracker.connect('notify::focus-app', () => this._update());
        this._update();
    }

    _update() {
        const app = this._tracker.focus_app;
        if (app) {
            this._label.text = app.get_name();
            this._icon.gicon = app.get_icon();
            this._aboutItem.label.text = `About ${app.get_name()}`;
        } else {
            this._label.text = 'Desktop';
            this._icon.gicon = null;
            this._aboutItem.label.text = 'About This App';
        }
    }

    _activateFocused() {
        const win = global.display.focus_window;
        if (win)
            Main.activateWindow(win);
    }

    destroy() {
        if (this._trackerId) {
            this._tracker.disconnect(this._trackerId);
            this._trackerId = 0;
        }
        super.destroy();
    }
});

// ---------------------------------------------------------------------------
// Window menu: Minimize / Zoom / Close for the focused window, plus a live
// list of the focused app's open windows to switch between.
// ---------------------------------------------------------------------------
const WindowMenuButton = GObject.registerClass(
class WindowMenuButton extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'macOSMenuBar_Window', false);

        this._label = new St.Label({
            text: 'Window',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'menubar-label',
        });
        this.add_child(this._label);

        this._tracker = Shell.WindowTracker.get_default();
        this.menu.connect('open-state-changed', (menu, open) => {
            if (open)
                this._rebuild();
        });
    }

    _rebuild() {
        this.menu.removeAll();

        const minimizeItem = new PopupMenu.PopupMenuItem('Minimize');
        minimizeItem.connect('activate', () => {
            const win = global.display.focus_window;
            if (win)
                win.minimize();
        });
        this.menu.addMenuItem(minimizeItem);

        const zoomItem = new PopupMenu.PopupMenuItem('Zoom');
        zoomItem.connect('activate', () => {
            const win = global.display.focus_window;
            if (!win)
                return;
            if (win.get_maximized())
                win.unmaximize(Meta.MaximizeFlags.BOTH);
            else
                win.maximize(Meta.MaximizeFlags.BOTH);
        });
        this.menu.addMenuItem(zoomItem);

        const closeItem = new PopupMenu.PopupMenuItem('Close');
        closeItem.connect('activate', () => {
            const win = global.display.focus_window;
            if (win)
                win.delete(global.get_current_time());
        });
        this.menu.addMenuItem(closeItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const app = this._tracker.focus_app;
        const windows = app ? app.get_windows() : [];

        if (windows.length === 0) {
            const none = new PopupMenu.PopupMenuItem(
                app ? '(No Open Windows)' : '(No Active App)');
            none.setSensitive(false);
            this.menu.addMenuItem(none);
            return;
        }

        for (const win of windows) {
            const item = new PopupMenu.PopupMenuItem(win.get_title() || app.get_name());
            if (win.has_focus())
                item.setOrnament(PopupMenu.Ornament.DOT);
            item.connect('activate', () => Main.activateWindow(win));
            this.menu.addMenuItem(item);
        }
    }
});

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------
export default class MacMenuBarExtension extends Extension {
    enable() {
        // GNOME 50 ships Wayland only, so this is just an informational
        // check (not a hard block). Meta.is_wayland_compositor() isn't
        // reliably introspectable across shell versions, so use the
        // session-type env var instead — it can't throw.
        if (GLib.getenv('XDG_SESSION_TYPE') !== 'wayland')
            console.warn(`[${this.metadata.uuid}] Not running under Wayland — some features (menu shortcuts) may not work.`);

        this._buttons = [];

        const add = (role, button, position) => {
            Main.panel.addToStatusArea(role, button, position, 'left');
            this._buttons.push(button);
        };

        add('macos-app-menu', new AppMenuButton(), 1);

        add('macos-file-menu', new MenuBarButton('File', [
            { label: 'New Window', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_n) },
            { label: 'New Tab', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_t) },
            'separator',
            { label: 'Close Window', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_w) },
            { label: 'Quit', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_q) },
        ]), 2);

        add('macos-edit-menu', new MenuBarButton('Edit', [
            { label: 'Undo', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_z) },
            { label: 'Redo', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_Shift_L, Clutter.KEY_z) },
            'separator',
            { label: 'Cut', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_x) },
            { label: 'Copy', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_c) },
            { label: 'Paste', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_v) },
            'separator',
            { label: 'Select All', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_a) },
            { label: 'Find…', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_f) },
        ]), 3);

        add('macos-view-menu', new MenuBarButton('View', [
            { label: 'Enter Full Screen', action: () => sendKeyCombo(Clutter.KEY_F11) },
            'separator',
            { label: 'Zoom In', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_plus) },
            { label: 'Zoom Out', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_minus) },
            { label: 'Actual Size', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_0) },
            'separator',
            { label: 'Reload', action: () => sendKeyCombo(Clutter.KEY_Control_L, Clutter.KEY_r) },
        ]), 4);

        add('macos-window-menu', new WindowMenuButton(), 5);

        add('macos-help-menu', new MenuBarButton('Help', [
            { label: 'App Help', action: () => sendKeyCombo(Clutter.KEY_F1) },
        ]), 6);
    }

    disable() {
        for (const button of this._buttons ?? [])
            button.destroy();
        this._buttons = null;
        _virtualKeyboard = null;
    }
}
