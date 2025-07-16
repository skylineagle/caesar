import { useCallback, useEffect } from "react";

export type KeyModifiers = {
  down: boolean;
  repeat: boolean;
  ctrl: boolean;
  shift: boolean;
};

// Map key codes to expected key names for letter keys
const KEY_CODE_MAP: Record<string, string> = {
  KeyA: "a",
  KeyB: "b",
  KeyC: "c",
  KeyD: "d",
  KeyE: "e",
  KeyF: "f",
  KeyG: "g",
  KeyH: "h",
  KeyI: "i",
  KeyJ: "j",
  KeyK: "k",
  KeyL: "l",
  KeyM: "m",
  KeyN: "n",
  KeyO: "o",
  KeyP: "p",
  KeyQ: "q",
  KeyR: "r",
  KeyS: "s",
  KeyT: "t",
  KeyU: "u",
  KeyV: "v",
  KeyW: "w",
  KeyX: "x",
  KeyY: "y",
  KeyZ: "z",
};

export default function useKeyboardListener(
  keys: string[],
  listener: (key: string | null, modifiers: KeyModifiers) => void,
  preventDefault: boolean = true,
) {
  const keyDownListener = useCallback(
    (e: KeyboardEvent) => {
      // @ts-expect-error we know this field exists
      if (!e || e.target.tagName == "INPUT") {
        return;
      }

      const modifiers = {
        down: true,
        repeat: e.repeat,
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
      };

      // For letter keys, use the key code mapping to support different keyboard layouts
      // For special keys, use e.key as before
      const keyToCheck = KEY_CODE_MAP[e.code] || e.key;

      if (keys.includes(keyToCheck)) {
        if (preventDefault) e.preventDefault();
        listener(keyToCheck, modifiers);
      } else if (e.key === "Shift" || e.key === "Control" || e.key === "Meta") {
        listener(null, modifiers);
      }
    },
    [keys, listener, preventDefault],
  );

  const keyUpListener = useCallback(
    (e: KeyboardEvent) => {
      if (!e) {
        return;
      }

      const modifiers = {
        down: false,
        repeat: false,
        ctrl: false,
        shift: false,
      };

      // For letter keys, use the key code mapping to support different keyboard layouts
      // For special keys, use e.key as before
      const keyToCheck = KEY_CODE_MAP[e.code] || e.key;

      if (keys.includes(keyToCheck)) {
        e.preventDefault();
        listener(keyToCheck, modifiers);
      } else if (e.key === "Shift" || e.key === "Control" || e.key === "Meta") {
        listener(null, modifiers);
      }
    },
    [keys, listener],
  );

  useEffect(() => {
    document.addEventListener("keydown", keyDownListener);
    document.addEventListener("keyup", keyUpListener);
    return () => {
      document.removeEventListener("keydown", keyDownListener);
      document.removeEventListener("keyup", keyUpListener);
    };
  }, [listener, keyDownListener, keyUpListener]);
}
